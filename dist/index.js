#!/usr/bin/env node

// src/index.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
var execFileAsync = promisify(execFile);
var MAX_SCAN_APPS = 3000;
var ICON_SIZE = 96;
var REPORT_WIDTH = 1600;
var REPORT_HEIGHT = 1100;
async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("-h") || args.has("--help")) {
    printHelp();
    return;
  }
  const roots = ["/Applications", path.join(os.homedir(), "Applications")];
  const apps = await findApps(roots);
  const machineArch = os.arch();
  const electronApps = [];
  const rosetta2Apps = [];
  const vscodeApps = [];
  for (const app of apps) {
    const [isElectron, isVSCode, needsRosetta] = await Promise.all([
      detectElectron(app),
      detectVSCode(app),
      detectNeedsRosetta2(app, machineArch)
    ]);
    if (isElectron)
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
      scannedApps: apps.length,
      electronApps: electronApps.length,
      rosetta2Apps: rosetta2Apps.length,
      vscodeApps: vscodeApps.length
    },
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
    const reportPath = await createReportImage(electronApps, process.cwd());
    console.log(`
Report image: ${reportPath}`);
  }
}
function printHelp() {
  console.log(`safariyyds - Scan your Mac for Electron, Rosetta2, and VSCode applications

Usage:
  npx safariyyds
  npx safariyyds --json
  npx safariyyds --no-report
  npx safariyyds --help
`);
}
async function findApps(roots) {
  const found = [];
  for (const root of roots) {
    const appPaths = await collectAppBundles(root);
    for (const appPath of appPaths) {
      const info = await readAppInfo(appPath);
      found.push(info);
      if (found.length >= MAX_SCAN_APPS) {
        return found;
      }
    }
  }
  return found;
}
async function collectAppBundles(root) {
  const appPaths = [];
  let rootStat;
  try {
    rootStat = await fs.stat(root);
  } catch {
    return appPaths;
  }
  if (!rootStat.isDirectory()) {
    return appPaths;
  }
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current)
      break;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      const fullPath = path.join(current, entry.name);
      if (entry.name.endsWith(".app")) {
        appPaths.push(fullPath);
        continue;
      }
      if (entry.name.endsWith(".framework") || entry.name === "node_modules") {
        continue;
      }
      queue.push(fullPath);
      if (appPaths.length >= MAX_SCAN_APPS) {
        return appPaths;
      }
    }
  }
  return appPaths;
}
async function readAppInfo(appPath) {
  const appName = path.basename(appPath, ".app");
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const [executableName, bundleIdentifier] = await Promise.all([
    readPlistValue(infoPlistPath, "CFBundleExecutable"),
    readPlistValue(infoPlistPath, "CFBundleIdentifier")
  ]);
  const executablePath = executableName ? path.join(appPath, "Contents", "MacOS", executableName) : null;
  return {
    appPath,
    appName,
    executablePath,
    bundleIdentifier
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
async function detectElectron(app) {
  const electronFramework = path.join(app.appPath, "Contents", "Frameworks", "Electron Framework.framework");
  try {
    await fs.access(electronFramework);
    return true;
  } catch {
    return false;
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
    const { stdout } = await execFileAsync("/usr/bin/lipo", ["-archs", app.executablePath], {
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
  console.log(`Total apps scanned: ${result.totals.scannedApps}`);
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
async function createReportImage(electronApps, outDir) {
  const reportPath = path.join(outDir, "safariyyds-report.png");
  const renderItems = await buildRenderItems(electronApps.slice(0, 12));
  const svg = buildReportSvg(electronApps.length, renderItems);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: REPORT_WIDTH
    }
  });
  const pngData = resvg.render().asPng();
  await fs.writeFile(reportPath, pngData);
  return reportPath;
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
  const tempRoot = path.join(tmpdir(), `safariyyds-icon-${randomUUID()}`);
  await fs.mkdir(tempRoot, { recursive: true });
  try {
    const iconPath = await findAppIconIcns(app);
    if (!iconPath)
      return null;
    const pngPath = path.join(tempRoot, "icon.png");
    await execFileAsync("/usr/bin/sips", ["-s", "format", "png", "-z", String(ICON_SIZE), String(ICON_SIZE), iconPath, "--out", pngPath], {
      timeout: 4000,
      maxBuffer: 1024 * 512
    });
    const buffer = await fs.readFile(pngPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
async function findAppIconIcns(app) {
  const infoPlistPath = path.join(app.appPath, "Contents", "Info.plist");
  const resourcesDir = path.join(app.appPath, "Contents", "Resources");
  const declaredIcon = await readPlistValue(infoPlistPath, "CFBundleIconFile") || await readPlistValue(infoPlistPath, "CFBundleIconName");
  if (declaredIcon) {
    const direct = path.join(resourcesDir, declaredIcon);
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
    const candidate = path.join(resourcesDir, name);
    if (await pathExists(candidate))
      return candidate;
  }
  try {
    const files = await fs.readdir(resourcesDir);
    const firstIcns = files.find((file) => file.toLowerCase().endsWith(".icns"));
    if (!firstIcns)
      return null;
    return path.join(resourcesDir, firstIcns);
  } catch {
    return null;
  }
}
async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
function buildReportSvg(electronCount, items) {
  const cards = items.length > 0 ? items : [{ appName: "No Electron App", appPath: "", iconDataUri: "" }];
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
  <text x="800" y="210" text-anchor="middle" font-size="78" font-weight="700" fill="#a60000" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">喜 报</text>

  <text x="800" y="380" text-anchor="middle" font-size="62" font-weight="600" fill="#111" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">
    您的计算机上有
    <tspan font-size="120" font-weight="800"> ${electronCount} </tspan>
    个 Electron 应用！
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
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to scan applications: ${message}`);
  process.exitCode = 1;
});
