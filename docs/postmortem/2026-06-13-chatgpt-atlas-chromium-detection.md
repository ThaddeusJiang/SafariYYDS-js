# ChatGPT Atlas Chromium Detection

## What happened

ChatGPT Atlas was installed under `/Applications/ChatGPT Atlas.app`, but `safariyyds --json` did not include it in `chromiumApps`.

## Root cause

ChatGPT Atlas uses the top-level bundle identifier `com.openai.atlas`. Its Chromium browser runtime is packaged under `Contents/Support/ChatGPT Atlas.app` with `com.openai.atlas.web` and `ChatGPT Atlas Framework.framework`, so the existing top-level framework checks did not see an explicit Chromium, CEF, or Electron framework.

## Fix applied

Replaced bundle identifier matching with Chromium runtime evidence scanning. ChatGPT Atlas is now detected through the nested browser runtime under `Contents/Support/ChatGPT Atlas.app`.

## What we learned

Custom Chromium browsers can hide the browser runtime behind product-specific support bundles and framework names. The scanner needs to look through nested app contents for Chromium runtime files instead of stopping at top-level frameworks.
