"use strict";

const LIGATURE_STYLE_MARKER = "codex-linux-font-ligatures";
const LIGATURE_SELECTOR =
  ".ProseMirror,.ProseMirror *,pre,pre *,code,code *,kbd,kbd *,samp,samp *,.font-mono,.font-mono *";
const LIGATURE_STYLE = [
  `/* ${LIGATURE_STYLE_MARKER} */`,
  `:root{--vscode-editor-font-ligatures:"liga" 1,"calt" 1}`,
  `${LIGATURE_SELECTOR}{-webkit-font-variant-ligatures:normal!important;font-variant-ligatures:normal!important;font-feature-settings:"liga" 1,"calt" 1!important}`,
].join("");
const FONT_SURFACE_PATTERN =
  /font-variant-ligatures|font-feature-settings|--font-mono|--vscode-editor-font-family/u;

function normalizeDisabledLigatures(source) {
  return source
    .split("-webkit-font-variant-ligatures:none")
    .join("-webkit-font-variant-ligatures:normal")
    .split("font-variant-ligatures:none")
    .join("font-variant-ligatures:normal")
    .replace(
      /font-feature-settings:(["'])liga\1\s*0/gu,
      'font-feature-settings:"liga" 1,"calt" 1',
    );
}

function applyFontLigatureCssPatch(source) {
  const patchedSource = normalizeDisabledLigatures(source);
  if (patchedSource.includes(LIGATURE_STYLE_MARKER)) {
    return patchedSource;
  }

  if (!FONT_SURFACE_PATTERN.test(patchedSource)) {
    return patchedSource;
  }

  return `${patchedSource}\n${LIGATURE_STYLE}`;
}

module.exports = {
  LIGATURE_STYLE_MARKER,
  applyFontLigatureCssPatch,
  patches: [
    {
      id: "webview-font-ligatures",
      phase: "webview-asset",
      order: 20_660,
      ciPolicy: "optional",
      pattern: /^(?:app|prosemirror)-.*\.css$/u,
      missingDescription: "webview CSS font bundles",
      skipDescription: "Linux font ligature display patch",
      apply: applyFontLigatureCssPatch,
    },
  ],
};
