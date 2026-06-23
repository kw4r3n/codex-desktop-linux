#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  createPatchReport,
  patchExtractedApp,
} = require("../../scripts/patch-linux-window-ui.js");
const {
  LIGATURE_STYLE_MARKER,
  applyFontLigatureCssPatch,
  patches,
} = require("./patch.js");

function withTempFeatureConfig(enabled, fn) {
  const originalConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-font-ligatures-config-"),
  );
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(tempDir, "features.json");
  fs.writeFileSync(
    process.env.CODEX_LINUX_FEATURES_CONFIG,
    JSON.stringify({ enabled }, null, 2),
  );
  try {
    return fn();
  } finally {
    if (originalConfig == null) {
      delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    } else {
      process.env.CODEX_LINUX_FEATURES_CONFIG = originalConfig;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function withLinuxFeatureRootEnv(root, fn) {
  const originalRoot = process.env.CODEX_LINUX_FEATURES_ROOT;
  process.env.CODEX_LINUX_FEATURES_ROOT = root;
  try {
    return fn();
  } finally {
    if (originalRoot == null) {
      delete process.env.CODEX_LINUX_FEATURES_ROOT;
    } else {
      process.env.CODEX_LINUX_FEATURES_ROOT = originalRoot;
    }
  }
}

function copyFeatureTo(featuresRoot) {
  const target = path.join(featuresRoot, "font-ligatures");
  fs.mkdirSync(target, { recursive: true });
  for (const file of ["feature.json", "patch.js", "README.md"]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(target, file));
  }
}

function withSilencedConsole(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test("CSS patch enables ligatures on editor and code surfaces", () => {
  const source =
    '.ProseMirror{-webkit-font-variant-ligatures:none;font-variant-ligatures:none;font-feature-settings:"liga" 0}.token{color:red}';
  const patched = applyFontLigatureCssPatch(source);

  assert.match(patched, /codex-linux-font-ligatures/u);
  assert.match(patched, /-webkit-font-variant-ligatures:normal/u);
  assert.match(patched, /font-variant-ligatures:normal/u);
  assert.match(patched, /font-feature-settings:"liga" 1,"calt" 1/u);
  assert.doesNotMatch(patched, /font-variant-ligatures:none/u);
  assert.equal(applyFontLigatureCssPatch(patched), patched);
});

test("CSS patch leaves unrelated assets unchanged", () => {
  const source = ".toast{color:var(--token-text-primary)}";

  assert.equal(applyFontLigatureCssPatch(source), source);
});

test("feature loader exposes the webview CSS descriptor when enabled", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-font-ligatures-feature-"),
  );
  const featuresRoot = path.join(tempDir, "linux-features");
  fs.mkdirSync(featuresRoot, { recursive: true });
  copyFeatureTo(featuresRoot);

  try {
    withLinuxFeatureRootEnv(featuresRoot, () => {
      withTempFeatureConfig(["font-ligatures"], () => {
        const descriptors = loadLinuxFeaturePatchDescriptors({});
        assert.deepEqual(
          descriptors.map((descriptor) => descriptor.id),
          ["feature:font-ligatures:webview-font-ligatures"],
        );
        assert.equal(descriptors[0].phase, "webview-asset");
        assert.equal(descriptors[0].ciPolicy, "optional");
      });
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("descriptor applies to hashed app and ProseMirror CSS bundles", () => {
  assert.equal(patches.length, 1);
  assert.match("app-abc123.css", patches[0].pattern);
  assert.match("prosemirror-abc123.css", patches[0].pattern);
  assert.doesNotMatch("highlight-code-abc123.js", patches[0].pattern);
  assert.match(
    patches[0].apply("--font-mono:ui-monospace,monospace"),
    new RegExp(LIGATURE_STYLE_MARKER, "u"),
  );
});

test("patch engine applies the enabled feature to webview CSS assets", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-font-ligatures-engine-"),
  );
  const featuresRoot = path.join(tempDir, "linux-features");
  const webviewAssetsDir = path.join(tempDir, "webview", "assets");
  fs.mkdirSync(featuresRoot, { recursive: true });
  fs.mkdirSync(webviewAssetsDir, { recursive: true });
  copyFeatureTo(featuresRoot);

  const cssPath = path.join(webviewAssetsDir, "app-test.css");
  fs.writeFileSync(
    cssPath,
    '.ProseMirror{font-variant-ligatures:none;font-feature-settings:"liga" 0}',
  );

  try {
    withLinuxFeatureRootEnv(featuresRoot, () => {
      withTempFeatureConfig(["font-ligatures"], () => {
        withSilencedConsole(() => {
          patchExtractedApp(tempDir, { report: createPatchReport() });
        });
      });
    });

    const patched = fs.readFileSync(cssPath, "utf8");
    assert.match(patched, new RegExp(LIGATURE_STYLE_MARKER, "u"));
    assert.doesNotMatch(patched, /font-variant-ligatures:none/u);
    assert.match(patched, /font-feature-settings:"liga" 1,"calt" 1/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
