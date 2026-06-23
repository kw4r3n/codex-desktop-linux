"use strict";

const fs = require("node:fs");
const path = require("node:path");

const NORMAL_FONT_ENV = "CODEX_LINUX_NORMAL_FONT_FAMILY";
const CODE_FONT_ENV = "CODEX_LINUX_CODE_FONT_FAMILY";
const NORMAL_FONT_STORAGE_KEY = "codex-linux-normal-font-family";
const CODE_FONT_STORAGE_KEY = "codex-linux-code-font-family";
const GENERAL_SETTINGS_ASSET_PATTERN = /^general-settings-.*\.js$/u;
const FONT_FAMILY_RUNTIME_MARKER = "__codexLinuxApplyFontFamilyOverrides";
const FONT_FAMILY_SETTINGS_MARKER = "CodexLinuxFontFamilySettingsSection";

const GENERIC_FONT_FAMILIES = new Set([
  "caption",
  "cursive",
  "emoji",
  "fantasy",
  "fangsong",
  "math",
  "menu",
  "message-box",
  "monospace",
  "sans-serif",
  "serif",
  "small-caption",
  "status-bar",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

function cleanToken(token) {
  let value = String(token ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (!value || /[;{}]/u.test(value)) {
    return null;
  }

  const lower = value.toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(lower) && /^[a-z-]+$/u.test(value)) {
    return lower;
  }

  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}

function normalizeFontFamilyList(value, fallback) {
  const tokens = String(value ?? "")
    .split(",")
    .map(cleanToken)
    .filter(Boolean);
  return tokens.length > 0 ? tokens.join(",") : fallback;
}

function buildFontFamilyStyle(env = process.env) {
  const normalFontFamily = normalizeFontFamilyList(
    env[NORMAL_FONT_ENV],
    "system-ui,sans-serif",
  );
  const codeFontFamily = normalizeFontFamilyList(
    env[CODE_FONT_ENV],
    "ui-monospace,monospace",
  );

  return [
    `/* codex-linux-font-family-overrides */`,
    `:root{--codex-linux-default-normal-font-family:${normalFontFamily};--codex-linux-default-code-font-family:${codeFontFamily};--codex-linux-normal-font-family:var(--codex-linux-user-normal-font-family,var(--codex-linux-default-normal-font-family));--codex-linux-code-font-family:var(--codex-linux-user-code-font-family,var(--codex-linux-default-code-font-family));--vscode-font-family:var(--codex-linux-normal-font-family);--vscode-editor-font-family:var(--codex-linux-code-font-family);--font-sans:var(--codex-linux-normal-font-family);--font-mono:var(--codex-linux-code-font-family)}`,
    `body,button,input,textarea,select,.font-sans,.font-sans *{font-family:var(--codex-linux-normal-font-family)!important}`,
    `pre,code,kbd,samp,.font-mono,.font-mono *{font-family:var(--codex-linux-code-font-family)!important}`,
  ].join("");
}

function applyFontFamilyCssPatch(source, env = process.env) {
  const fontEnv =
    env != null &&
    typeof env === "object" &&
    (Object.hasOwn(env, NORMAL_FONT_ENV) || Object.hasOwn(env, CODE_FONT_ENV))
      ? env
      : process.env;
  if (source.includes("codex-linux-font-family-overrides")) {
    return source;
  }

  if (
    !/--font-sans|--font-mono|--vscode-font-family|--vscode-editor-font-family|font-family/u.test(
      source,
    )
  ) {
    return source;
  }

  return `${buildFontFamilyStyle(fontEnv)}\n${source}`;
}

function storageKeysSource() {
  const normalKey = JSON.stringify(NORMAL_FONT_STORAGE_KEY);
  const codeKey = JSON.stringify(CODE_FONT_STORAGE_KEY);
  return `{normal:${normalKey},code:${codeKey}}`;
}

function fontFamilyRuntimeSource() {
  return `(()=>{const keys=${storageKeysSource()},generic=new Set(${JSON.stringify([...GENERIC_FONT_FAMILIES])});function cleanToken(token){let value=String(token??"").trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1).trim();if(!value||/[;{}]/u.test(value))return null;let lower=value.toLowerCase();return generic.has(lower)&&/^[a-z-]+$/u.test(value)?lower:'"'+value.replace(/\\\\/gu,"\\\\\\\\").replace(/"/gu,'\\\\"')+'"'}function normalize(value){let tokens=String(value??"").split(",").map(cleanToken).filter(Boolean);return tokens.length>0?tokens.join(","):""}window.${FONT_FAMILY_RUNTIME_MARKER}=function(){try{let root=document.documentElement,normal=normalize(localStorage.getItem(keys.normal)),code=normalize(localStorage.getItem(keys.code));normal?root.style.setProperty("--codex-linux-user-normal-font-family",normal):root.style.removeProperty("--codex-linux-user-normal-font-family");code?root.style.setProperty("--codex-linux-user-code-font-family",code):root.style.removeProperty("--codex-linux-user-code-font-family")}catch{}};window.addEventListener("storage",event=>{event.key===keys.normal||event.key===keys.code?window.${FONT_FAMILY_RUNTIME_MARKER}():void 0});window.${FONT_FAMILY_RUNTIME_MARKER}()})();`;
}

function applyFontFamilyRuntimePatch(source) {
  if (source.includes(FONT_FAMILY_RUNTIME_MARKER)) {
    return source;
  }

  return `${fontFamilyRuntimeSource()}\n${source}`;
}

function fontFamilySettingsSource() {
  const normalKey = JSON.stringify(NORMAL_FONT_STORAGE_KEY);
  const codeKey = JSON.stringify(CODE_FONT_STORAGE_KEY);
  return `function codexLinuxFontFamilyValue(key){try{return localStorage.getItem(key)||""}catch{return""}}function codexLinuxWriteFontFamilyValue(key,value){try{let next=String(value??"").trim();next?localStorage.setItem(key,next):localStorage.removeItem(key);window.${FONT_FAMILY_RUNTIME_MARKER}?.();window.dispatchEvent(new CustomEvent("codex-linux-font-family-overrides-changed",{detail:{key,value:next}}))}catch{}}function CodexLinuxFontFamilyInput({storageKey,label,placeholder}){let[value,setValue]=X.useState(()=>codexLinuxFontFamilyValue(storageKey));X.useEffect(()=>{let update=()=>setValue(codexLinuxFontFamilyValue(storageKey));return window.addEventListener("storage",update),window.addEventListener("codex-linux-font-family-overrides-changed",update),()=>{window.removeEventListener("storage",update),window.removeEventListener("codex-linux-font-family-overrides-changed",update)}},[storageKey]);return(0,Z.jsx)(\`input\`,{"aria-label":label,className:\`focus-visible:ring-token-focus h-7 max-w-[8.5rem] rounded-lg border border-token-border bg-token-main-surface-secondary px-2 text-sm text-token-text-primary outline-none placeholder:text-token-text-secondary focus-visible:ring-2 max-sm:max-w-none\`,placeholder,spellCheck:!1,type:\`text\`,value,onChange:event=>{let next=event.currentTarget.value;setValue(next);codexLinuxWriteFontFamilyValue(storageKey,next)}})}function ${FONT_FAMILY_SETTINGS_MARKER}(){return[(0,Z.jsx)(J,{control:(0,Z.jsx)(CodexLinuxFontFamilyInput,{storageKey:${normalKey},label:\`Normal text font\`,placeholder:\`Inter, "Noto Sans JP", sans-serif\`}),label:\`Normal text font\`,variant:\`nested\`},\`normal-font-family\`),(0,Z.jsx)(J,{control:(0,Z.jsx)(CodexLinuxFontFamilyInput,{storageKey:${codeKey},label:\`Code font\`,placeholder:\`"JetBrains Mono", "Noto Sans Mono", monospace\`}),label:\`Code font\`,variant:\`nested\`},\`code-font-family\`)]}`;
}

function appearanceThemeFontRowsNeedle() {
  return "O.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(dn,{ariaLabel:e.ariaLabel,placeholder:e.placeholder,value:h[e.key],onChange:t=>{y({[e.key]:t})}}),label:e.label,variant:`nested`},e.key))";
}

function appearanceThemeFontRowsReplacement() {
  return `O.flatMap(e=>{let row=(0,Z.jsx)(J,{control:(0,Z.jsx)(dn,{ariaLabel:e.ariaLabel,placeholder:e.placeholder,value:h[e.key],onChange:t=>{y({[e.key]:t})}}),label:e.label,variant:\`nested\`},e.key);return e.key===\`ui\`?[row,...${FONT_FAMILY_SETTINGS_MARKER}()]:[row]})`;
}

function applyFontFamilySettingsPatch(source) {
  if (source.includes(FONT_FAMILY_SETTINGS_MARKER)) {
    return source;
  }

  const functionNeedle = "function tn({";
  const rowsNeedle = appearanceThemeFontRowsNeedle();
  if (!source.includes(functionNeedle) || !source.includes(rowsNeedle)) {
    return source;
  }

  return source
    .replace(functionNeedle, `${fontFamilySettingsSource()}${functionNeedle}`)
    .replace(rowsNeedle, appearanceThemeFontRowsReplacement());
}

function findAppearanceSettingsAsset(assetsDirs) {
  const dirs = Array.isArray(assetsDirs) ? assetsDirs : [assetsDirs];
  for (const assetsDir of dirs) {
  if (!fs.existsSync(assetsDir)) {
      continue;
  }

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!GENERAL_SETTINGS_ASSET_PATTERN.test(assetName)) {
      continue;
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    if (source.includes("function tn({") && source.includes(appearanceThemeFontRowsNeedle())) {
      return { assetPath, source };
    }
  }
  }

  return null;
}

function patchAppearanceSettingsAsset(extractedDir) {
  const assetsDirs = [
    path.join(extractedDir, "webview", "assets"),
    path.join(extractedDir, "assets"),
  ];
  const asset = findAppearanceSettingsAsset(assetsDirs);
  if (asset == null) {
    return {
      changed: false,
      matched: false,
      reason: `WARN: not found Appearance settings asset in ${assetsDirs.join(", ")}`,
    };
  }

  const patched = applyFontFamilySettingsPatch(asset.source);
  if (patched === asset.source) {
    const matched = asset.source.includes(FONT_FAMILY_SETTINGS_MARKER);
    return {
      changed: false,
      matched,
      reason: matched ? "already-applied" : "WARN: not found Appearance theme UI font rows patch site",
    };
  }

  fs.writeFileSync(asset.assetPath, patched, "utf8");
  return { changed: true, matched: true, reason: path.basename(asset.assetPath) };
}

module.exports = {
  CODE_FONT_ENV,
  CODE_FONT_STORAGE_KEY,
  FONT_FAMILY_RUNTIME_MARKER,
  FONT_FAMILY_SETTINGS_MARKER,
  GENERAL_SETTINGS_ASSET_PATTERN,
  NORMAL_FONT_ENV,
  NORMAL_FONT_STORAGE_KEY,
  applyFontFamilyCssPatch,
  applyFontFamilyRuntimePatch,
  applyFontFamilySettingsPatch,
  buildFontFamilyStyle,
  fontFamilyRuntimeSource,
  fontFamilySettingsSource,
  normalizeFontFamilyList,
  patchAppearanceSettingsAsset,
};
