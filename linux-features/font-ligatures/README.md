# Font Ligatures

Enables ligature rendering for code, editor, and monospace webview surfaces on
Linux.

The feature patches hashed webview CSS assets during install. It normalizes
known upstream declarations that disable ligatures and appends a marked CSS
override for ProseMirror, `pre`, `code`, `kbd`, `samp`, and Tailwind
`font-mono` surfaces.

This feature is disabled by default. Enable it locally with:

```json
{
  "enabled": ["font-ligatures"]
}
```

Then rebuild or reinstall the Linux app through the normal installer or native
setup flow.
