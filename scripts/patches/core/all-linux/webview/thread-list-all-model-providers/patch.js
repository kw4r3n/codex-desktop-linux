"use strict";

const {
  applyLinuxThreadListAllModelProvidersPatch,
} = require("../../../../webview-assets.js");

module.exports = {
  id: "linux-thread-list-all-model-providers",
  phase: "webview-asset",
  order: 1046,
  ciPolicy: "optional",
  pattern: /^thread-context-inputs-.*\.js$/,
  missingDescription: "thread context inputs webview bundle",
  skipDescription: "Linux thread list all-model-providers patch",
  apply: applyLinuxThreadListAllModelProvidersPatch,
};
