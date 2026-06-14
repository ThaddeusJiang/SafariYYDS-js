#!/usr/bin/env node

// src/index.ts
import { promises as fs3 } from "node:fs";
import path3 from "node:path";
import os2 from "node:os";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";

// src/detection.ts
import { promises as fs } from "node:fs";
import path from "node:path";
var MAX_EVIDENCE_DEPTH = 12;
var MAX_EVIDENCE_ENTRIES = 1e4;
var CHROMIUM_SCORE_THRESHOLD = 5;
var ELECTRON_SCORE_THRESHOLD = 5;
async function detectRuntime(app) {
  const score = await scoreRuntimeEvidence(app);
  return {
    isChromium: score.chromium >= CHROMIUM_SCORE_THRESHOLD || score.electron >= ELECTRON_SCORE_THRESHOLD,
    isElectron: score.electron >= ELECTRON_SCORE_THRESHOLD
  };
}
async function scoreRuntimeEvidence(app) {
  const score = { chromium: 0, electron: 0, entriesSeen: 0 };
  const startStat = await statOrNull(app.appPath);
  if (!startStat)
    return score;
  scorePathEvidence(app.appPath, startStat.isDirectory(), app, score);
  if (startStat.isFile()) {
    return score;
  }
  const queue = [{ targetPath: app.appPath, depth: 0 }];
  while (queue.length > 0 && score.entriesSeen < MAX_EVIDENCE_ENTRIES) {
    const current = queue.shift();
    if (!current || current.depth >= MAX_EVIDENCE_DEPTH)
      continue;
    let entries;
    try {
      entries = await fs.readdir(current.targetPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current.targetPath, entry.name);
      const isDirectory = entry.isDirectory();
      score.entriesSeen += 1;
      scorePathEvidence(fullPath, isDirectory, app, score);
      if (score.entriesSeen >= MAX_EVIDENCE_ENTRIES)
        break;
      if (!isDirectory)
        continue;
      queue.push({ targetPath: fullPath, depth: current.depth + 1 });
    }
  }
  return score;
}
function scorePathEvidence(targetPath, isDirectory, app, score) {
  const name = path.basename(targetPath);
  const lowerName = name.toLowerCase();
  const lowerPath = targetPath.toLowerCase();
  if (lowerName === "electron framework.framework") {
    score.electron += 8;
    score.chromium += 5;
    return;
  }
  if (isDirectory && /(^|[^a-z])(chromium|chrome|cef)([^a-z]|$)/i.test(name) && lowerName.endsWith(".framework")) {
    score.chromium += 8;
    return;
  }
  if (isDirectory && lowerName.endsWith(".framework")) {
    const frameworkRoot = `${path.sep}frameworks${path.sep}`;
    if (lowerPath.includes(frameworkRoot) && hasChromiumCacheContext(app)) {
      score.chromium += 3;
    }
  }
  if (isChromiumExecutableName(name)) {
    score.chromium += hasChromiumCacheContext(app) ? 8 : 4;
  }
  if (isElectronExecutableName(name) && hasNpmContext(app)) {
    score.electron += 8;
    score.chromium += 5;
  }
  if (lowerName === "chrome_crashpad_handler") {
    score.chromium += 3;
  }
  if (lowerName === "chrome_100_percent.pak" || lowerName === "chrome_200_percent.pak" || lowerName === "resources.pak") {
    score.chromium += 1;
  }
  if (lowerName === "libegl.dylib" || lowerName === "libglesv2.dylib" || lowerName === "privacysandboxattestationspreloaded") {
    score.chromium += 1;
  }
  if (isDirectory && /(\(|\s)(gpu|renderer)(\)|\s)/i.test(name) && lowerName.endsWith(".app")) {
    score.chromium += 2;
  }
}
function hasChromiumCacheContext(app) {
  const lowerPath = app.appPath.toLowerCase();
  return app.sourceKind === "browser-cache" || lowerPath.includes("/ms-playwright/") || lowerPath.includes("/puppeteer/") || lowerPath.includes("/chromium-") || lowerPath.includes("/chrome/");
}
function hasNpmContext(app) {
  return app.sourceKind === "npm-package" || app.appPath.toLowerCase().includes("/node_modules/");
}
function isChromiumExecutableName(name) {
  const lowerName = name.toLowerCase();
  return lowerName === "chromium" || lowerName === "chrome" || lowerName === "chrome-headless-shell" || lowerName === "google chrome for testing";
}
function isElectronExecutableName(name) {
  const lowerName = name.toLowerCase();
  return lowerName === "electron";
}
async function statOrNull(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

// src/discovery.ts
import { promises as fs2 } from "node:fs";
import path2 from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var DEFAULT_MAX_TARGETS = 5000;
var MAX_APPLICATION_DEPTH = 8;
var MAX_CACHE_DEPTH = 10;
async function buildDefaultScanRoots(homeDir = os.homedir(), cwd = process.cwd(), env = process.env) {
  const roots = [
    { path: "/Applications", kind: "applications" },
    { path: path2.join(homeDir, "Applications"), kind: "applications" },
    { path: "/System/Applications", kind: "applications" },
    { path: path2.join(homeDir, "Library", "Caches", "ms-playwright"), kind: "browser-cache" },
    { path: path2.join(homeDir, ".cache", "ms-playwright"), kind: "browser-cache" },
    { path: path2.join(homeDir, ".cache", "puppeteer"), kind: "browser-cache" },
    { path: path2.join(homeDir, "Library", "Caches", "puppeteer"), kind: "browser-cache" },
    { path: path2.join(cwd, "node_modules", "electron", "dist"), kind: "npm-package" },
    { path: path2.join(cwd, "node_modules", "playwright-core", ".local-browsers"), kind: "browser-cache" },
    { path: path2.join(cwd, "node_modules", "playwright", ".local-browsers"), kind: "browser-cache" }
  ];
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    roots.push({ path: env.PLAYWRIGHT_BROWSERS_PATH, kind: "browser-cache" });
  }
  if (env.PUPPETEER_CACHE_DIR) {
    roots.push({ path: env.PUPPETEER_CACHE_DIR, kind: "browser-cache" });
  }
  for (const globalRoot of await npmGlobalRoots()) {
    roots.push({ path: path2.join(globalRoot, "electron", "dist"), kind: "npm-package" });
    roots.push({ path: path2.join(globalRoot, "playwright-core", ".local-browsers"), kind: "browser-cache" });
    roots.push({ path: path2.join(globalRoot, "playwright", ".local-browsers"), kind: "browser-cache" });
    roots.push({
      path: path2.join(globalRoot, "@playwright", "test", "node_modules", "playwright-core", ".local-browsers"),
      kind: "browser-cache"
    });
  }
  return dedupeRoots(roots);
}
async function discoverScanTargets(roots, maxTargets = DEFAULT_MAX_TARGETS) {
  const targetPaths = [];
  const seen = new Set;
  for (const root of roots) {
    for (const candidate of await collectCandidatePaths(root)) {
      const key = await stablePathKey(candidate.targetPath);
      if (seen.has(key))
        continue;
      seen.add(key);
      targetPaths.push(candidate);
      if (targetPaths.length >= maxTargets) {
        return readTargets(targetPaths);
      }
    }
  }
  return readTargets(targetPaths);
}
async function collectCandidatePaths(root) {
  const candidates = [];
  const rootStat = await statOrNull2(root.path);
  if (!rootStat)
    return candidates;
  if (root.path.endsWith(".app") && rootStat.isDirectory()) {
    candidates.push({ targetPath: root.path, kind: "app", sourceKind: root.kind });
    return candidates;
  }
  if (rootStat.isFile() && isCandidateExecutable(root.path)) {
    candidates.push({ targetPath: root.path, kind: "executable", sourceKind: root.kind });
    return candidates;
  }
  if (!rootStat.isDirectory())
    return candidates;
  const maxDepth = root.kind === "applications" ? MAX_APPLICATION_DEPTH : MAX_CACHE_DEPTH;
  const queue = [{ targetPath: root.path, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth)
      continue;
    let entries;
    try {
      entries = await fs2.readdir(current.targetPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path2.join(current.targetPath, entry.name);
      if (entry.isDirectory() && entry.name.endsWith(".app")) {
        candidates.push({ targetPath: fullPath, kind: "app", sourceKind: root.kind });
        continue;
      }
      if (entry.isFile() && root.kind !== "applications" && isCandidateExecutable(entry.name)) {
        candidates.push({ targetPath: fullPath, kind: "executable", sourceKind: root.kind });
        continue;
      }
      if (!entry.isDirectory())
        continue;
      if (shouldSkipDirectory(entry.name, root.kind))
        continue;
      queue.push({ targetPath: fullPath, depth: current.depth + 1 });
    }
  }
  return candidates;
}
async function readTargets(targetPaths) {
  const targets = [];
  for (const item of targetPaths) {
    targets.push(await readTargetInfo(item.targetPath, item.kind, item.sourceKind));
  }
  return targets;
}
async function readTargetInfo(targetPath, targetKind, sourceKind) {
  if (targetKind === "executable") {
    return {
      appPath: targetPath,
      appName: path2.basename(targetPath),
      executablePath: targetPath,
      bundleIdentifier: null,
      targetKind,
      sourceKind
    };
  }
  const appName = path2.basename(targetPath, ".app");
  const infoPlistPath = path2.join(targetPath, "Contents", "Info.plist");
  const [executableName, bundleIdentifier] = await Promise.all([
    readPlistValue(infoPlistPath, "CFBundleExecutable"),
    readPlistValue(infoPlistPath, "CFBundleIdentifier")
  ]);
  return {
    appPath: targetPath,
    appName,
    executablePath: executableName ? path2.join(targetPath, "Contents", "MacOS", executableName) : null,
    bundleIdentifier,
    targetKind,
    sourceKind
  };
}
async function readPlistValue(infoPlistPath, key) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/defaults", ["read", infoPlistPath, key], {
      timeout: 1500,
      maxBuffer: 1024 * 128
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
function isCandidateExecutable(targetPath) {
  const name = path2.basename(targetPath).toLowerCase();
  return name === "chrome" || name === "chromium" || name === "chrome-headless-shell" || name === "electron";
}
function shouldSkipDirectory(name, kind) {
  if (name === "node_modules" && kind === "applications")
    return true;
  if (name.endsWith(".framework") && kind === "applications")
    return true;
  return false;
}
async function npmGlobalRoots() {
  try {
    const { stdout } = await execFileAsync("npm", ["root", "-g"], {
      timeout: 1500,
      maxBuffer: 1024 * 32
    });
    return stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
function dedupeRoots(roots) {
  const seen = new Set;
  const deduped = [];
  for (const root of roots) {
    const key = `${root.kind}:${path2.resolve(root.path)}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    deduped.push(root);
  }
  return deduped;
}
async function stablePathKey(targetPath) {
  try {
    return await fs2.realpath(targetPath);
  } catch {
    return path2.resolve(targetPath);
  }
}
async function statOrNull2(targetPath) {
  try {
    return await fs2.stat(targetPath);
  } catch {
    return null;
  }
}

// src/index.ts
var execFileAsync2 = promisify2(execFile2);
var MAX_SCAN_TARGETS = 5000;
var ICON_SIZE = 96;
var REPORT_WIDTH = 1600;
var REPORT_HEIGHT = 1100;
async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("-h") || args.has("--help")) {
    printHelp();
    return;
  }
  const scanRoots = await buildDefaultScanRoots();
  const roots = scanRoots.map((root) => root.path);
  const apps = await discoverScanTargets(scanRoots, MAX_SCAN_TARGETS);
  const machineArch = os2.arch();
  const chromiumApps = [];
  const electronApps = [];
  const rosetta2Apps = [];
  const vscodeApps = [];
  for (const app of apps) {
    const [runtime, isVSCode, needsRosetta] = await Promise.all([
      detectRuntime(app),
      detectVSCode(app),
      detectNeedsRosetta2(app, machineArch)
    ]);
    if (runtime.isChromium)
      chromiumApps.push(app);
    if (runtime.isElectron)
      electronApps.push(app);
    if (isVSCode)
      vscodeApps.push(app.appPath);
    if (needsRosetta)
      rosetta2Apps.push(app.appPath);
  }
  const result = {
    scannedAt: new Date().toISOString(),
    machineArch,
    roots,
    totals: {
      scannedTargets: apps.length,
      scannedApps: apps.filter((item) => item.targetKind !== "executable").length,
      chromiumApps: chromiumApps.length,
      electronApps: electronApps.length,
      rosetta2Apps: rosetta2Apps.length,
      vscodeApps: vscodeApps.length
    },
    chromiumApps: sortPaths(chromiumApps.map((item) => item.appPath)),
    electronApps: sortPaths(electronApps.map((item) => item.appPath)),
    rosetta2Apps: sortPaths(rosetta2Apps),
    vscodeApps: sortPaths(vscodeApps)
  };
  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReadable(result);
  }
  if (!args.has("--no-report") && !args.has("--json")) {
    const reportPath = await createReportImage(chromiumApps, process.cwd());
    console.log(`
Report image: ${reportPath}`);
    await copyImageToClipboard(reportPath);
    console.log("Copied report image to clipboard.");
    await openImage(reportPath);
    console.log("Opened report image.");
  }
}
function printHelp() {
  console.log(`safariyyds - Scan your Mac for Chromium, Electron, Rosetta2, and VSCode applications

Usage:
  npx safariyyds
  npx safariyyds --json
  npx safariyyds --no-report
  npx safariyyds --help
`);
}
async function readPlistValue2(infoPlistPath, key) {
  try {
    const { stdout } = await execFileAsync2("/usr/bin/defaults", ["read", infoPlistPath, key], {
      timeout: 1500,
      maxBuffer: 1024 * 128
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
async function detectVSCode(app) {
  const name = app.appName.toLowerCase();
  const bundle = (app.bundleIdentifier || "").toLowerCase();
  return name.includes("visual studio code") || name.includes("vscode") || name.includes("vscodium") || name.includes("cursor") || name.includes("windsurf") || bundle.includes("com.microsoft.vscode") || bundle.includes("vscodium") || bundle.includes("cursor") || bundle.includes("windsurf");
}
async function detectNeedsRosetta2(app, machineArch) {
  if (machineArch !== "arm64")
    return false;
  if (!app.executablePath)
    return false;
  try {
    const { stdout } = await execFileAsync2("/usr/bin/lipo", ["-archs", app.executablePath], {
      timeout: 1500,
      maxBuffer: 1024 * 32
    });
    const archs = stdout.trim().split(/\s+/).map((item) => item.trim()).filter(Boolean);
    if (archs.length === 0)
      return false;
    const hasArm64 = archs.includes("arm64") || archs.includes("arm64e");
    const hasX64 = archs.includes("x86_64") || archs.includes("i386");
    return hasX64 && !hasArm64;
  } catch {
    return false;
  }
}
function sortPaths(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}
function printHumanReadable(result) {
  console.log(`SafariYYDS (NPX edition)`);
  console.log(`Scanned at: ${result.scannedAt}`);
  console.log(`Machine architecture: ${result.machineArch}`);
  console.log(`Scanned roots:`);
  for (const root of result.roots) {
    console.log(`  - ${root}`);
  }
  console.log("");
  console.log(`Total targets scanned: ${result.totals.scannedTargets}`);
  console.log(`App bundles scanned: ${result.totals.scannedApps}`);
  printSection("Chromium apps", result.chromiumApps);
  printSection("Electron apps", result.electronApps);
  printSection("Rosetta2-only apps", result.rosetta2Apps);
  printSection("VSCode apps", result.vscodeApps);
}
function printSection(title, entries) {
  console.log(`
${title} (${entries.length})`);
  if (entries.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const item of entries) {
    console.log(`  - ${item}`);
  }
}
async function createReportImage(chromiumApps, outDir) {
  const reportPath = path3.join(outDir, "safariyyds-report.png");
  const renderItems = await buildRenderItems(chromiumApps.slice(0, 12));
  const svg = buildReportSvg(chromiumApps.length, renderItems);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: REPORT_WIDTH
    }
  });
  const pngData = resvg.render().asPng();
  await fs3.writeFile(reportPath, pngData);
  return reportPath;
}
async function copyImageToClipboard(imagePath) {
  await execFileAsync2("/usr/bin/osascript", [
    "-e",
    `set the clipboard to (read (POSIX file "${escapeAppleScriptString(imagePath)}") as «class PNGf»)`
  ]);
}
async function openImage(imagePath) {
  await execFileAsync2("/usr/bin/open", [imagePath], {
    timeout: 4000,
    maxBuffer: 1024 * 64
  });
}
async function buildRenderItems(apps) {
  const items = [];
  for (const app of apps) {
    const iconDataUri = await extractAppIconDataUri(app);
    if (!iconDataUri)
      continue;
    items.push({
      appName: app.appName,
      appPath: app.appPath,
      iconDataUri
    });
  }
  return items;
}
async function extractAppIconDataUri(app) {
  const tempRoot = path3.join(tmpdir(), `safariyyds-icon-${randomUUID()}`);
  await fs3.mkdir(tempRoot, { recursive: true });
  try {
    const iconPath = await findAppIconIcns(app);
    if (!iconPath)
      return null;
    const pngPath = path3.join(tempRoot, "icon.png");
    await execFileAsync2("/usr/bin/sips", ["-s", "format", "png", "-z", String(ICON_SIZE), String(ICON_SIZE), iconPath, "--out", pngPath], {
      timeout: 4000,
      maxBuffer: 1024 * 512
    });
    const buffer = await fs3.readFile(pngPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    await fs3.rm(tempRoot, { recursive: true, force: true });
  }
}
async function findAppIconIcns(app) {
  const infoPlistPath = path3.join(app.appPath, "Contents", "Info.plist");
  const resourcesDir = path3.join(app.appPath, "Contents", "Resources");
  const declaredIcon = await readPlistValue2(infoPlistPath, "CFBundleIconFile") || await readPlistValue2(infoPlistPath, "CFBundleIconName");
  if (declaredIcon) {
    const direct = path3.join(resourcesDir, declaredIcon);
    const withExt = direct.endsWith(".icns") ? direct : `${direct}.icns`;
    if (await pathExists(withExt))
      return withExt;
    if (await pathExists(direct))
      return direct;
  }
  const fallbackNames = [
    `${app.appName}.icns`,
    "AppIcon.icns",
    "Electron.icns"
  ];
  for (const name of fallbackNames) {
    const candidate = path3.join(resourcesDir, name);
    if (await pathExists(candidate))
      return candidate;
  }
  try {
    const files = await fs3.readdir(resourcesDir);
    const firstIcns = files.find((file) => file.toLowerCase().endsWith(".icns"));
    if (!firstIcns)
      return null;
    return path3.join(resourcesDir, firstIcns);
  } catch {
    return null;
  }
}
async function pathExists(target) {
  try {
    await fs3.access(target);
    return true;
  } catch {
    return false;
  }
}
function buildReportSvg(chromiumCount, items) {
  const cards = items.length > 0 ? items : [{ appName: "No Chromium App", appPath: "", iconDataUri: "" }];
  const cardWidth = 220;
  const cardHeight = 220;
  const gap = 24;
  const panelX = 90;
  const panelWidth = 1420;
  const innerPadding = 22;
  const maxGridWidth = panelWidth - innerPadding * 2;
  const maxColumns = Math.max(1, Math.floor((maxGridWidth + gap) / (cardWidth + gap)));
  const perRow = Math.min(Math.max(1, cards.length), maxColumns);
  const startY = 520;
  const appCards = cards.map((item, idx) => {
    const row = Math.floor(idx / perRow);
    const rowStart = row * perRow;
    const rowCount = Math.min(perRow, cards.length - rowStart);
    const rowWidth = rowCount * cardWidth + (rowCount - 1) * gap;
    const rowStartX = panelX + (panelWidth - rowWidth) / 2;
    const col = idx - rowStart;
    const x = rowStartX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);
    const name = escapeXml(shorten(item.appName, 20));
    const iconMarkup = item.iconDataUri ? `<image href="${item.iconDataUri}" x="${x + 62}" y="${y + 30}" width="96" height="96"/>` : `<rect x="${x + 62}" y="${y + 30}" width="96" height="96" rx="20" fill="#f2f2f2"/>`;
    return `
  <g>
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="24" fill="rgba(255,255,255,0.72)" />
    ${iconMarkup}
    <text x="${x + cardWidth / 2}" y="${y + 165}" text-anchor="middle" font-size="24" fill="#111" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">${name}</text>
  </g>`;
  }).join(`
`);
  return `
<svg width="${REPORT_WIDTH}" height="${REPORT_HEIGHT}" viewBox="0 0 ${REPORT_WIDTH} ${REPORT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sun" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#fff84a" />
      <stop offset="50%" stop-color="#ffb300" />
      <stop offset="100%" stop-color="#ff3d00" />
    </radialGradient>
    <linearGradient id="banner" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff29a" />
      <stop offset="100%" stop-color="#ffd86b" />
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#sun)" />
  <rect x="90" y="90" width="1420" height="900" rx="26" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.65)" />
  <rect x="90" y="130" width="1420" height="120" fill="url(#banner)" opacity="0.9" />
  <text x="800" y="210" text-anchor="middle" font-size="72" font-weight="700" fill="#a60000" font-family="Arial Black, Arial, Helvetica, sans-serif">REPORT</text>

  <text x="800" y="380" text-anchor="middle" font-size="58" font-weight="600" fill="#111" font-family="Arial, Helvetica, sans-serif">
    Your Mac has
    <tspan font-size="120" font-weight="800"> ${chromiumCount} </tspan>
    Chromium apps!
  </text>

  ${appCards}

  <text x="800" y="1040" text-anchor="middle" font-size="22" fill="rgba(0,0,0,0.6)" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">Generated by safariyyds</text>
</svg>
`;
}
function shorten(text, maxLen) {
  if (text.length <= maxLen)
    return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function escapeAppleScriptString(text) {
  return text.replaceAll("\\", "\\\\").replaceAll('"', "\\\"");
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to scan applications: ${message}`);
  process.exitCode = 1;
});
