# Dia Chromium Detection

## What happened

Dia was installed under `/Applications/Dia.app`, but `safariyyds --json` did not include it in `chromiumApps`.

## Root cause

Dia uses the bundle identifier `company.thebrowser.dia` and ships frameworks such as `ArcCore.framework`. The Chromium detection rules only included `company.thebrowser.browser` for The Browser Company apps and framework names that explicitly mention Chromium, CEF, or Electron.

## Fix applied

Replaced bundle identifier matching with Chromium runtime evidence scanning. Dia is now detected through its Chrome resource packs, Chromium libraries, Privacy Sandbox data, and GPU/Renderer helper apps.

## What we learned

Chromium browser detection should not rely on product names or bundle identifiers. Runtime evidence is more durable and avoids one-off allowlist growth.
