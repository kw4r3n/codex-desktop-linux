#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("headroom proxy env enables balanced savings profile defaults", () => {
  const env = fs.readFileSync(path.join(__dirname, "env"), "utf8");
  for (const expected of [
    "HEADROOM_MODE=token",
    "HEADROOM_SAVINGS_PROFILE=balanced",
    "HEADROOM_SAVINGS_TARGET=0.70",
    "HEADROOM_TARGET_RATIO=0.30",
    "HEADROOM_COMPRESS_USER_MESSAGES=0",
    "HEADROOM_COMPRESS_SYSTEM_MESSAGES=0",
    "HEADROOM_PROTECT_RECENT=4",
    "HEADROOM_PROTECT_ANALYSIS_CONTEXT=1",
    "HEADROOM_MIN_TOKENS=250",
    "HEADROOM_MAX_ITEMS=15",
    "HEADROOM_SMART_CRUSHER_COMPACTION=0",
    "HEADROOM_FORCE_KOMPRESS=0",
    "HEADROOM_ACCURACY_GUARD=strict",
  ]) {
    assert.match(env, new RegExp(`^${expected}$`, "m"));
  }
});

const {
  enabledLinuxFeatureIds,
  enabledLinuxFeatureInstallPlan,
  stageEnabledLinuxFeatureInstall,
} = require("../../scripts/lib/linux-features.js");

function withTempFeatureConfig(enabled, fn) {
  const originalConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  const root = path.resolve(__dirname, "..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-headroom-feature-"));
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(tempDir, "features.json");
  try {
    fs.writeFileSync(process.env.CODEX_LINUX_FEATURES_CONFIG, JSON.stringify({ enabled }, null, 2));
    return fn(root);
  } finally {
    if (originalConfig == null) {
      delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    } else {
      process.env.CODEX_LINUX_FEATURES_CONFIG = originalConfig;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("headroom proxy feature stays disabled until listed in features.json", () => {
  withTempFeatureConfig([], (featuresRoot) => {
    assert.deepEqual(enabledLinuxFeatureIds({ featuresRoot }), []);
    assert.deepEqual(enabledLinuxFeatureInstallPlan({ featuresRoot }), {
      resources: [],
      runtimeHooks: [],
    });
  });
});

test("headroom proxy feature declares static env plus prelaunch and after-exit hooks", () => {
  withTempFeatureConfig(["headroom-proxy"], (featuresRoot) => {
    assert.deepEqual(enabledLinuxFeatureIds({ featuresRoot }), ["headroom-proxy"]);
    const plan = enabledLinuxFeatureInstallPlan({ featuresRoot });
    assert.equal(plan.resources.length, 0);
    assert.deepEqual(
      plan.runtimeHooks.map((hook) => [hook.id, hook.key, hook.target, hook.mode.toString(8).padStart(4, "0")]),
      [
        ["headroom-proxy", "env", ".codex-linux/env.d/headroom-proxy-env", "0644"],
        ["headroom-proxy", "prelaunch", ".codex-linux/prelaunch.d/headroom-proxy-prelaunch", "0755"],
        ["headroom-proxy", "afterExit", ".codex-linux/after-exit.d/headroom-proxy-after-exit", "0755"],
      ],
    );
  });
});

test("headroom proxy hooks stage with executable modes", () => {
  withTempFeatureConfig(["headroom-proxy"], (featuresRoot) => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-headroom-app-"));
    try {
      stageEnabledLinuxFeatureInstall(appDir, { featuresRoot });
      const envFile = path.join(appDir, ".codex-linux", "env.d", "headroom-proxy-env");
      const prelaunch = path.join(appDir, ".codex-linux", "prelaunch.d", "headroom-proxy-prelaunch");
      const afterExit = path.join(appDir, ".codex-linux", "after-exit.d", "headroom-proxy-after-exit");

      assert.match(fs.readFileSync(envFile, "utf8"), /^HEADROOM_PORT=8787$/m);
      assert.doesNotMatch(fs.readFileSync(envFile, "utf8"), /^OPENAI_BASE_URL=/m);
      assert.equal(fs.statSync(envFile).mode & 0o777, 0o644);
      assert.equal(fs.statSync(prelaunch).mode & 0o777, 0o755);
      assert.equal(fs.statSync(afterExit).mode & 0o777, 0o755);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});

test("prelaunch writes redirect env only from runtime hook path", () => {
  const prelaunch = fs.readFileSync(path.join(__dirname, "prelaunch.sh"), "utf8");
  assert.match(prelaunch, /runtime_env_dir="\$\{CODEX_LINUX_FEATURE_STATE_ENV_DIR:-\$state_dir\/feature-env\.d\}"/);
  assert.match(prelaunch, /OPENAI_BASE_URL=%s/);
  assert.match(prelaunch, /headroom command not found/);
  assert.match(prelaunch, /unset OPENAI_BASE_URL OPENAI_API_BASE_URL/);
  assert.match(prelaunch, /OPENAI_TARGET_API_URL="\$target_base"/);
});
