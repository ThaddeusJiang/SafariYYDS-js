# SafariYYDS-js

[![npm version](https://img.shields.io/npm/v/safariyyds.svg)](https://www.npmjs.com/package/safariyyds)
[![npm downloads](https://img.shields.io/npm/dm/safariyyds.svg)](https://www.npmjs.com/package/safariyyds)

A simple `npx` edition inspired by [Lakr233/SafariYYDS](https://github.com/Lakr233/SafariYYDS).
It scans your Mac for Chromium, Electron, Rosetta2-only, and VSCode-family applications.
The scan includes installed `.app` bundles, nested Chromium runtimes, Playwright browser caches, Puppeteer browser caches, and common npm-installed Electron/Playwright browser locations.

## Usage

```bash
npx safariyyds
```

By default, this command generates `./safariyyds-report.png` with app icons and names.
It also copies the PNG to clipboard and opens it with the default image viewer.

Optional flags:

- `--json`: Print machine-readable JSON.
- `--no-report`: Skip report image generation.
- `--help`: Show help.

## Scan Coverage

SafariYYDS looks for runtime evidence instead of maintaining an app-name allowlist:

- Electron framework bundles.
- Chromium, Chrome, and CEF framework bundles.
- Chromium runtime files such as Chrome resource packs, `libEGL.dylib`, `libGLESv2.dylib`, crashpad handlers, and GPU/Renderer helpers.
- Playwright browsers under `~/Library/Caches/ms-playwright`.
- Puppeteer browsers under `~/.cache/puppeteer`.
- Browser caches configured by `PLAYWRIGHT_BROWSERS_PATH` and `PUPPETEER_CACHE_DIR`.
- Electron and Playwright browser installs under local and global npm package roots.

## Sample Report

After running `npx safariyyds`, you will get a PNG report like this:

![SafariYYDS Report](https://raw.githubusercontent.com/ThaddeusJiang/SafariYYDS-js/main/docs/report-sample.png)

## Development

```bash
bun install
bun test
bun run check
bun run build
bun run dev -- --json
```

## Author

ThaddeusJiang
