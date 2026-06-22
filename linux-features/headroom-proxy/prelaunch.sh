#!/bin/bash
set -euo pipefail

_app_dir="${1:?usage: prelaunch hook <app-dir> <state-dir> <log-dir>}"
state_dir="${2:?usage: prelaunch hook <app-dir> <state-dir> <log-dir>}"
log_dir="${3:?usage: prelaunch hook <app-dir> <state-dir> <log-dir>}"

host="${HEADROOM_HOST:-127.0.0.1}"
port="${HEADROOM_PORT:-8787}"
client_host="${HEADROOM_CLIENT_HOST:-}"
startup_timeout="${HEADROOM_PROXY_STARTUP_TIMEOUT:-10}"
pid_file="$state_dir/headroom-proxy.pid"
proxy_log="$log_dir/headroom-proxy.log"
runtime_env_dir="${CODEX_LINUX_FEATURE_STATE_ENV_DIR:-$state_dir/feature-env.d}"
runtime_env_file="$runtime_env_dir/headroom-proxy.env"
raw_mode="${CODEX_HEADROOM_RAW_MODE:-${CODEX_HEADROOM_PROXY_BYPASS:-${HEADROOM_PROXY_BYPASS:-0}}}"

log() {
    echo "headroom-proxy: $*"
}

flag_is_true() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

normalize_port() {
    local raw="$1"
    case "$raw" in
        ""|*[!0-9]*)
            log "invalid HEADROOM_PORT=$raw"
            return 1
            ;;
    esac
    local number=$((10#$raw))
    if [ "$number" -lt 1 ] || [ "$number" -gt 65535 ]; then
        log "invalid HEADROOM_PORT=$raw"
        return 1
    fi
    printf '%s\n' "$number"
}

normalize_timeout() {
    local raw="$1"
    case "$raw" in
        ""|*[!0-9]*)
            printf '10\n'
            return 0
            ;;
    esac
    printf '%s\n' "$((10#$raw))"
}

if flag_is_true "$raw_mode"; then
    rm -f "$runtime_env_file"
    log "raw mode requested; continuing without Headroom proxy"
    exit 0
fi

find_headroom_command() {
    if [ -n "${HEADROOM_BIN:-}" ]; then
        if [ -x "$HEADROOM_BIN" ]; then
            printf '%s\n' "$HEADROOM_BIN"
            return 0
        fi
        log "HEADROOM_BIN not executable: $HEADROOM_BIN"
        return 1
    fi

    if command -v headroom >/dev/null 2>&1; then
        command -v headroom
        return 0
    fi

    return 1
}

headroom_port_open() {
    local probe_host="$1"
    local probe_port="$2"
    ( exec 3<>/dev/tcp/"$probe_host"/"$probe_port" ) >/dev/null 2>&1
}

pid_matches_headroom_proxy() {
    local pid="$1"
    [ -n "$pid" ] && [ -d "/proc/$pid" ] || return 1
    local cmdline
    cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    case "$cmdline" in
        *headroom*proxy*) return 0 ;;
        *) return 1 ;;
    esac
}

wait_for_proxy() {
    local probe_host="$1"
    local probe_port="$2"
    local timeout="$3"
    local deadline=$((SECONDS + timeout))
    while [ "$SECONDS" -le "$deadline" ]; do
        if headroom_port_open "$probe_host" "$probe_port"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

client_connect_host() {
    if [ -n "$client_host" ]; then
        printf '%s\n' "$client_host"
        return 0
    fi

    case "$host" in
        0.0.0.0|::) printf '127.0.0.1\n' ;;
        *) printf '%s\n' "$host" ;;
    esac
}

client_base_url() {
    local connect_host="$1"
    local connect_port="$2"
    printf 'http://%s:%s/v1\n' "$connect_host" "$connect_port"
}

write_runtime_env() {
    local base_url="$1"
    local proxy_url="${base_url%/v1}"
    local tmp="$runtime_env_file.tmp.$$"
    mkdir -p "$runtime_env_dir"
    chmod 700 "$runtime_env_dir" 2>/dev/null || true
    {
        printf 'OPENAI_BASE_URL=%s\n' "$base_url"
        printf 'HEADROOM_BASE_URL=%s\n' "$proxy_url"
        printf 'CODEX_HEADROOM_PROXY_URL=%s\n' "$proxy_url"
    } > "$tmp"
    mv "$tmp" "$runtime_env_file"
}

port="$(normalize_port "$port")" || exit 0
startup_timeout="$(normalize_timeout "$startup_timeout")"
probe_host="$(client_connect_host)"
base_url="$(client_base_url "$probe_host" "$port")"
rm -f "$runtime_env_file"

if [ -f "$pid_file" ]; then
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if pid_matches_headroom_proxy "$existing_pid"; then
        if wait_for_proxy "$probe_host" "$port" 1; then
            write_runtime_env "$base_url"
            log "using existing Headroom proxy pid=$existing_pid at $base_url"
            exit 0
        fi
    else
        rm -f "$pid_file"
    fi
fi

if headroom_port_open "$probe_host" "$port"; then
    write_runtime_env "$base_url"
    log "using existing service at $base_url"
    exit 0
fi

headroom_cmd="$(find_headroom_command || true)"
if [ -z "$headroom_cmd" ]; then
    log "headroom command not found; install with: pip install \"headroom-ai[proxy]\""
    exit 0
fi

mkdir -p "$state_dir" "$log_dir"
target_base="${HEADROOM_TARGET_OPENAI_BASE_URL:-}"
current_openai_base="${OPENAI_BASE_URL:-}"
if [ -z "$target_base" ] && [ -n "$current_openai_base" ] && [ "${current_openai_base%/}" != "${base_url%/}" ]; then
    target_base="$OPENAI_BASE_URL"
fi

(
    unset OPENAI_BASE_URL OPENAI_API_BASE_URL
    if [ -n "$target_base" ]; then
        export OPENAI_TARGET_API_URL="$target_base"
    fi
    exec "$headroom_cmd" proxy --host "$host" --port "$port"
) >> "$proxy_log" 2>&1 &
proxy_pid=$!
printf '%s\n' "$proxy_pid" > "$pid_file"

if wait_for_proxy "$probe_host" "$port" "$startup_timeout"; then
    write_runtime_env "$base_url"
    log "started Headroom proxy pid=$proxy_pid at $base_url"
    exit 0
fi

log "Headroom proxy did not become ready within ${startup_timeout}s; continuing without proxy"
rm -f "$runtime_env_file"
exit 0
