#!/bin/bash
set -euo pipefail

app_dir="${1:?usage: after-exit hook <app-dir> <state-dir> <log-dir> <status>}"
state_dir="${2:?usage: after-exit hook <app-dir> <state-dir> <log-dir> <status>}"
_log_dir="${3:?usage: after-exit hook <app-dir> <state-dir> <log-dir> <status>}"
_status="${4:-0}"

pid_file="$state_dir/headroom-proxy.pid"
runtime_env_dir="${CODEX_LINUX_FEATURE_STATE_ENV_DIR:-$state_dir/feature-env.d}"
runtime_env_file="$runtime_env_dir/headroom-proxy.env"
stop_on_exit="${HEADROOM_PROXY_STOP_ON_EXIT:-1}"
kill_grace="${HEADROOM_PROXY_KILL_GRACE:-5}"

log() {
    echo "headroom-proxy: $*"
}

truthy() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

case "$kill_grace" in
    ""|*[!0-9]*) kill_grace=5 ;;
esac

pid_cmdline_starts_with() {
    local pid="$1" bin="$2" cmdline=""
    IFS= read -r -d '' cmdline < "/proc/$pid/cmdline" 2>/dev/null || true
    case "$cmdline" in
        "$bin"|"$bin "*) return 0 ;;
        *) return 1 ;;
    esac
}

install_app_is_running() {
    local proc pid
    for proc in /proc/[0-9]*/cmdline; do
        [ -e "$proc" ] || continue
        pid="${proc#/proc/}"
        pid="${pid%/cmdline}"
        if pid_cmdline_starts_with "$pid" "$app_dir/electron"; then
            return 0
        fi
    done
    return 1
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

rm -f "$runtime_env_file"

truthy "$stop_on_exit" || exit 0
[ -f "$pid_file" ] || exit 0
pid="$(cat "$pid_file" 2>/dev/null || true)"
rm -f "$pid_file"

if install_app_is_running; then
    log "leaving Headroom proxy running; another app instance still active"
    exit 0
fi

pid_matches_headroom_proxy "$pid" || exit 0
log "stopping Headroom proxy pid=$pid"
kill "$pid" 2>/dev/null || exit 0
sleep "$kill_grace"
if pid_matches_headroom_proxy "$pid"; then
    log "escalating Headroom proxy pid=$pid to SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
fi
