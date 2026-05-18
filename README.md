# SafariYYDS-js

A simple `npx` edition inspired by [Lakr233/SafariYYDS](https://github.com/Lakr233/SafariYYDS).

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

## Sample Report

After running `npx safariyyds`, you will get a PNG report like this:

![SafariYYDS Report](./docs/report-sample.png)

## Development

```bash
bun install
bun run check
bun run build
bun run dev -- --json
```
