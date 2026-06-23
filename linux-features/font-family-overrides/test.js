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
  CODE_FONT_ENV,
  FONT_FAMILY_RUNTIME_MARKER,
  FONT_FAMILY_SETTINGS_MARKER,
  NORMAL_FONT_ENV,
  applyFontFamilyCssPatch,
  applyFontFamilyRuntimePatch,
  applyFontFamilySettingsPatch,
} = require("./settings.js");

function withTempFeatureConfig(enabled, fn) {
  const originalConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-font-family-config-"));
  const configPath = path.join(tempDir, "features.json");
  fs.writeFileSync(configPath, JSON.stringify({ enabled }, null, 2));
  process.env.CODEX_LINUX_FEATURES_CONFIG = configPath;
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

function withFontEnv(env, fn) {
  const originalNormal = process.env[NORMAL_FONT_ENV];
  const originalCode = process.env[CODE_FONT_ENV];
  process.env[NORMAL_FONT_ENV] = env[NORMAL_FONT_ENV];
  process.env[CODE_FONT_ENV] = env[CODE_FONT_ENV];
  try {
    return fn();
  } finally {
    if (originalNormal == null) {
      delete process.env[NORMAL_FONT_ENV];
    } else {
      process.env[NORMAL_FONT_ENV] = originalNormal;
    }

    if (originalCode == null) {
      delete process.env[CODE_FONT_ENV];
    } else {
      process.env[CODE_FONT_ENV] = originalCode;
    }
  }
}

function copyFeatureTo(featuresRoot) {
  const targetDir = path.join(featuresRoot, "font-family-overrides");
  fs.cpSync(__dirname, targetDir, { recursive: true });
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

function appearanceSettingsFixture() {
  return [
    "function tn({showCodeFont:e}){let h={},y=()=>{},O=[{ariaLabel:`Light UI font`,key:`ui`,label:`UI font`,placeholder:`system-ui`}];",
    "e&&O.push({ariaLabel:`Light code font`,key:`code`,label:`Code font`,placeholder:`monospace`});",
    "return(0,Z.jsxs)(nn,{children:[O.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(dn,{ariaLabel:e.ariaLabel,placeholder:e.placeholder,value:h[e.key],onChange:t=>{y({[e.key]:t})}}),label:e.label,variant:`nested`},e.key))]})}",
    "function $n(){let r,i,a,o,s,c,l;return(0,Z.jsx)(Y,{children:(0,Z.jsx)(Y.Content,{children:(0,Z.jsxs)(Mt,{children:[r,i,a,o,s,c,l]})})})}",
    "function Hr(){return (0,Z.jsx)(J,{label:`UI font size`})}",
    "function Ur(){return (0,Z.jsx)(J,{label:`Code font size`})}",
  ].join("");
}

test("font-family CSS patch injects default and override variables", () => {
  const source = ":root{--font-sans:var(--x);--font-mono:var(--y)}";
  const patched = applyFontFamilyCssPatch(source, {
    [NORMAL_FONT_ENV]: 'Inter, "Noto Sans JP", sans-serif',
    [CODE_FONT_ENV]: '"JetBrains Mono", "Noto Sans Mono", monospace',
  });

  assert.match(patched, /codex-linux-font-family-overrides/u);
  assert.match(
    patched,
    /--codex-linux-default-normal-font-family:"Inter","Noto Sans JP",sans-serif/u,
  );
  assert.match(
    patched,
    /--codex-linux-default-code-font-family:"JetBrains Mono","Noto Sans Mono",monospace/u,
  );
  assert.match(
    patched,
    /--codex-linux-normal-font-family:var\(--codex-linux-user-normal-font-family/u,
  );
  assert.match(
    patched,
    /--codex-linux-code-font-family:var\(--codex-linux-user-code-font-family/u,
  );
  assert.match(patched, /body,button,input,textarea,select,.font-sans,.font-sans \*/u);
  assert.match(patched, /pre,code,kbd,samp,.font-mono,.font-mono \*/u);
  assert.equal(applyFontFamilyCssPatch(patched), patched);
});

test("font-family feature descriptors load when enabled", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-font-family-feature-"));
  const featuresRoot = path.join(tempDir, "linux-features");
  fs.mkdirSync(featuresRoot);
  copyFeatureTo(featuresRoot);

  try {
    withLinuxFeatureRootEnv(featuresRoot, () => {
      withTempFeatureConfig(["font-family-overrides"], () => {
        const descriptors = loadLinuxFeaturePatchDescriptors({});
        assert.deepEqual(
          descriptors.map((descriptor) => descriptor.id),
          [
            "feature:font-family-overrides:webview-font-family-overrides",
            "feature:font-family-overrides:webview-font-family-runtime",
            "feature:font-family-overrides:appearance-font-settings",
          ],
        );
        assert.equal(descriptors[0].phase, "webview-asset");
        assert.equal(descriptors[1].phase, "webview-asset");
        assert.equal(descriptors[2].phase, "extracted-app");
        assert.equal(descriptors[0].ciPolicy, "optional");
      });
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runtime patch adds the localStorage font bridge once", () => {
  const source = "console.log('app-main')";
  const patched = applyFontFamilyRuntimePatch(source);

  assert.match(patched, RegExp(FONT_FAMILY_RUNTIME_MARKER, "u"));
  assert.match(patched, /codex-linux-normal-font-family/u);
  assert.match(patched, /codex-linux-code-font-family/u);
  assert.equal(applyFontFamilyRuntimePatch(patched), patched);
});

test("settings patch adds font rows under each Appearance theme UI font row", () => {
  const source = appearanceSettingsFixture();
  const patched = applyFontFamilySettingsPatch(source);

  assert.match(patched, RegExp(FONT_FAMILY_SETTINGS_MARKER, "u"));
  assert.match(patched, /Normal text font/u);
  assert.match(patched, /Code font/u);
  assert.match(
    patched,
    /O\.flatMap\(e=>\{let row=\(0,Z\.jsx\)\(J,\{control:\(0,Z\.jsx\)\(dn,/u,
  );
  assert.match(
    patched,
    /return e\.key===`ui`\?\[row,\.\.\.CodexLinuxFontFamilySettingsSection\(\)\]:\[row\]/u,
  );
  assert.doesNotMatch(patched, /children:\[r,i,a,o,\(0,Z\.jsx\)\(/u);
  assert.equal(applyFontFamilySettingsPatch(patched), patched);
});

test("patch engine applies CSS, runtime, and Appearance settings patches", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-font-family-engine-"));
  const featuresRoot = path.join(tempDir, "linux-features");
  const webviewAssetsDir = path.join(tempDir, "webview", "assets");
  fs.mkdirSync(featuresRoot);
  fs.mkdirSync(webviewAssetsDir, { recursive: true });
  copyFeatureTo(featuresRoot);

  const cssPath = path.join(webviewAssetsDir, "app-test.css");
  const runtimePath = path.join(webviewAssetsDir, "app-main-test.js");
  const settingsPath = path.join(webviewAssetsDir, "general-settings-test.js");
  const linuxDesktopPath = path.join(webviewAssetsDir, "linux-desktop-settings-linux.js");
  fs.writeFileSync(cssPath, ":root{--font-sans:var(--x);--font-mono:var(--y)}");
  fs.writeFileSync(runtimePath, "console.log('app-main')");
  fs.writeFileSync(settingsPath, appearanceSettingsFixture());
  fs.writeFileSync(linuxDesktopPath, "function LinuxDesktopSettings(){return null}");

  try {
    withLinuxFeatureRootEnv(featuresRoot, () => {
      withTempFeatureConfig(["font-family-overrides"], () => {
        withFontEnv(
          {
              [NORMAL_FONT_ENV]: "Inter, sans-serif",
              [CODE_FONT_ENV]: "JetBrains Mono, monospace",
          },
          () => {
            withSilencedConsole(() => {
              patchExtractedApp(tempDir, {
                report: createPatchReport(),
              });
            });
          },
        );
      });
    });

    assert.match(
      fs.readFileSync(cssPath, "utf8"),
      /--codex-linux-default-normal-font-family:"Inter",sans-serif/u,
    );
    assert.match(
      fs.readFileSync(cssPath, "utf8"),
      /--codex-linux-default-code-font-family:"JetBrains Mono",monospace/u,
    );
    assert.match(
      fs.readFileSync(runtimePath, "utf8"),
      RegExp(FONT_FAMILY_RUNTIME_MARKER, "u"),
    );
    assert.match(
      fs.readFileSync(settingsPath, "utf8"),
      RegExp(FONT_FAMILY_SETTINGS_MARKER, "u"),
    );
    assert.doesNotMatch(
      fs.readFileSync(linuxDesktopPath, "utf8"),
      RegExp(FONT_FAMILY_SETTINGS_MARKER, "u"),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
