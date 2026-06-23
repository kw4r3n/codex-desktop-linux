"use strict";

const {
  CODE_FONT_ENV,
  NORMAL_FONT_ENV,
  applyFontFamilyCssPatch,
  applyFontFamilyRuntimePatch,
  patchAppearanceSettingsAsset,
} = require("./settings.js");

function status(result, warnings = []) {
  if (result?.matched === false) {
    return {
      status: "skipped-optional",
      reason: result.reason ?? warnings[0] ?? null,
    };
  }

  return {
    status: result?.changed ? "applied" : "already-applied",
    reason: result?.reason ?? warnings[0] ?? null,
  };
}

module.exports = [
  {
    id: "webview-font-family-overrides",
    phase: "webview-asset",
    order: 20_670,
    ciPolicy: "optional",
    pattern: /^(?:app|prosemirror)-.*\.css$/u,
    targetSummary: () =>
      `${NORMAL_FONT_ENV}/${CODE_FONT_ENV} CSS font-family overrides`,
    apply: applyFontFamilyCssPatch,
  },
  {
    id: "webview-font-family-runtime",
    phase: "webview-asset",
    order: 20_671,
    ciPolicy: "optional",
    pattern: /^app-main-.*\.js$/u,
    targetSummary: () => "webview localStorage font-family runtime bridge",
    apply: applyFontFamilyRuntimePatch,
  },
  {
    id: "appearance-font-settings",
    phase: "extracted-app",
    order: 20_672,
    ciPolicy: "optional",
    targetSummary: () => "Appearance font family settings rows",
    apply: patchAppearanceSettingsAsset,
    status,
  },
];
