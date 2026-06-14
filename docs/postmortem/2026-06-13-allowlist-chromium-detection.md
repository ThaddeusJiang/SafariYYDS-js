# Allowlist Chromium Detection

## What happened

Chromium detection was implemented as a growing list of known browser names, bundle identifiers, and framework names. This detected some apps but missed Chromium runtimes installed by tools such as Playwright and Puppeteer, and it required new code for every product-specific browser.

## Root cause

The scanner mixed discovery and detection. It only discovered `.app` bundles under `/Applications` and `~/Applications`, then detection guessed Chromium status from app-specific metadata. That excluded browser caches, npm-installed Electron apps, Chromium headless shell executables, and nested Chromium runtimes inside product-specific app bundles.

## Fix applied

Split scanning into discovery and runtime detection:

- `discovery` finds app bundles and Chromium executables under application directories, Playwright caches, Puppeteer caches, environment-configured browser caches, and local/global npm package roots.
- `detection` scores runtime evidence such as Electron frameworks, Chromium/Chrome/CEF frameworks, Chrome resource packs, Chromium libraries, crashpad handlers, and GPU/Renderer helper apps.

## What we learned

For this tool, “find Chromium” must mean “find Chromium runtime evidence,” not “recognize app brands.” Name and bundle identifier rules can be useful diagnostics, but they should not be the foundation of detection.
