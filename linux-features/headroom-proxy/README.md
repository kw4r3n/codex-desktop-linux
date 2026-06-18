# Headroom Proxy

Starts a local [Headroom](https://github.com/chopratejas/headroom) proxy before
Codex Desktop cold start, then points OpenAI-compatible traffic at that proxy
only after the proxy is reachable.

This feature is disabled by default. Enable it with:

```json
{
  "enabled": ["headroom-proxy"]
}
```

Install Headroom separately:

```bash
pip install "headroom-ai[proxy]"
```

## Runtime

The static env hook sets only Headroom process defaults:

- `HEADROOM_HOST=127.0.0.1`
- `HEADROOM_PORT=8787`
- `HEADROOM_PROXY_STARTUP_TIMEOUT=10`
- `HEADROOM_PROXY_STOP_ON_EXIT=1`
- `HEADROOM_TELEMETRY=off`

The prelaunch hook probes or starts `headroom proxy --host "$HEADROOM_HOST"
--port "$HEADROOM_PORT"`. If the proxy becomes reachable, it writes a runtime
env file under the app state dir. The launcher then exports:

- `OPENAI_BASE_URL=http://127.0.0.1:8787/v1`
- `HEADROOM_BASE_URL=http://127.0.0.1:8787`
- `CODEX_HEADROOM_PROXY_URL=http://127.0.0.1:8787`

If `headroom` is not installed or startup fails, the runtime env file is not
written and Codex Desktop launches without the Headroom redirect.

## Overrides

- `HEADROOM_BIN=/path/to/headroom`
- `HEADROOM_HOST=127.0.0.1`
- `HEADROOM_CLIENT_HOST=127.0.0.1`
- `HEADROOM_PORT=8787`
- `HEADROOM_TARGET_OPENAI_BASE_URL=https://custom.openai.endpoint`
- `HEADROOM_PROXY_STARTUP_TIMEOUT=10`
- `HEADROOM_PROXY_STOP_ON_EXIT=0`
- `HEADROOM_PROXY_KILL_GRACE=5`
- `HEADROOM_OUTPUT_SHAPER=1`
- `HEADROOM_TELEMETRY=on`

When `HEADROOM_TARGET_OPENAI_BASE_URL` is unset and an inherited
`OPENAI_BASE_URL` points somewhere other than the local Headroom proxy, the
feature passes that inherited value to Headroom as `OPENAI_TARGET_API_URL`.

Logs:

- launcher log: `~/.cache/codex-desktop/launcher.log`
- proxy log: `~/.cache/codex-desktop/headroom-proxy.log`

## Validate

```bash
node --test linux-features/headroom-proxy/test.js
bash -n launcher/start.sh.template
```
