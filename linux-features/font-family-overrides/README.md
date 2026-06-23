# Font Family Overrides

Adds opt-in Linux font-family overrides for the Codex webview.

The feature patches webview CSS so normal UI text and code/monospace surfaces
can use separate font-family stacks. Defaults can be provided at build time:

- `CODEX_LINUX_NORMAL_FONT_FAMILY`: normal interface text.
- `CODEX_LINUX_CODE_FONT_FAMILY`: code blocks, monospace UI, terminals, and diffs.

Example:

```bash
CODEX_LINUX_NORMAL_FONT_FAMILY='Inter, "Noto Sans JP", sans-serif' \
CODEX_LINUX_CODE_FONT_FAMILY='"JetBrains Mono", "Noto Sans Mono", monospace' \
./install.sh
```

When enabled, the Appearance settings page also gets Linux font family rows
directly under the `UI font` row inside each Light theme and Dark theme card.
Values entered there are saved in webview local storage and apply immediately
without rebuilding.

Enable it with:

```json
{
  "enabled": ["font-family-overrides"]
}
```

This feature is disabled by default.
