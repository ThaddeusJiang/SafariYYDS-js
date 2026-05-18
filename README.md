# SafariYYDS-js

A simple `npx` edition inspired by [Lakr233/SafariYYDS](https://github.com/Lakr233/SafariYYDS).

## Usage

```bash
npx safariyyds
```

By default, this command generates `./safariyyds-report.png` with app icons and names.

Optional flags:

- `--json`: Print machine-readable JSON.
- `--no-report`: Skip report image generation.
- `--help`: Show help.

## Sample Report

After running `npx safariyyds`, you will get a PNG report like this:

![SafariYYDS Report](./safariyyds-report.png)

## Development

```bash
bun install
bun run check
bun run build
bun run dev -- --json
```
