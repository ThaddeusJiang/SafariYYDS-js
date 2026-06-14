# SafariYYDS-js

[![npm version](https://img.shields.io/npm/v/safariyyds.svg)](https://www.npmjs.com/package/safariyyds)
[![npm downloads](https://img.shields.io/npm/dm/safariyyds.svg)](https://www.npmjs.com/package/safariyyds)

A macOS-only `npx` edition inspired by [Lakr233/SafariYYDS](https://github.com/Lakr233/SafariYYDS).

## Requirements

- macOS
- Node.js 18+

This CLI scans macOS `.app` bundles in `/Applications` and `~/Applications`.
It also uses macOS system tools such as `defaults`, `lipo`, `sips`, `osascript`, and `open`.

## Usage

```bash
npx safariyyds
```

By default, this command scans Chromium apps on macOS and generates `./safariyyds-report.png` with app icons and names.
It also copies the PNG to clipboard and opens it with the default image viewer.

Optional flags:

- `--json`: Print machine-readable JSON.
- `--no-report`: Skip report image generation.
- `--help`: Show help.

## Sample Report

After running `npx safariyyds`, you will get a PNG report like this:

![SafariYYDS Report](https://raw.githubusercontent.com/ThaddeusJiang/SafariYYDS-js/main/docs/report-sample.png)

## Development

```bash
bun install
bun run check
bun run build
bun run dev -- --json
```

## Author

ThaddeusJiang
