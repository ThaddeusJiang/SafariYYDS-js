# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-18

### Added
- Generate a visual PNG report with Electron app icons and names.
- Auto-copy the generated report image to the clipboard.
- Auto-open the generated report image with the system default viewer.
- Add a tracked sample report image for README rendering.

### Changed
- Switch report headline copy to English.
- Improve report card layout with adaptive centered rows to prevent overflow.
- Update README with sample report documentation.

### Fixed
- Use a portable build configuration by externalizing `@resvg/resvg-js`.
- Replace unstable icon extraction flow with `.icns` + `sips` conversion for reliable icon rendering.
- Fix broken README image preview by referencing a tracked image path.

## [0.1.0] - 2026-05-18

### Added
- Bootstrap `safariyyds` as a Bun + TypeScript CLI.
- Implement macOS app scanning for Electron apps, Rosetta2-only apps (Apple Silicon), and VSCode-family apps.
- Add human-readable and JSON output modes.
- Add release checks and npm publish configuration.

[Unreleased]: https://github.com/ThaddeusJiang/SafariYYDS-js/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ThaddeusJiang/SafariYYDS-js/releases/tag/v0.2.0
[0.1.0]: https://github.com/ThaddeusJiang/SafariYYDS-js/releases
