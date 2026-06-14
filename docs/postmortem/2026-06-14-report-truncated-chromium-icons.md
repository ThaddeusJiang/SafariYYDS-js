# Report Truncated Chromium Icons

## What happened

The scanner detected 18 Chromium targets, but the generated report image did not show all 18 logos.

## Root cause

The report renderer still used the older visual limit of `chromiumApps.slice(0, 12)`. It also skipped any target whose icon could not be extracted, which removed executable targets such as `chrome-headless-shell` from the report entirely.

## Fix applied

Moved report rendering into a testable `report` module, removed the 12-item slice, kept iconless targets as placeholder cards, and made the SVG grid compact/dynamic so all 18 detected targets fit above the footer.

## What we learned

The report must reflect scan results, not an older visual cap. Rendering tests should cover both item count and layout bounds so future scan expansion cannot silently hide detected targets.
