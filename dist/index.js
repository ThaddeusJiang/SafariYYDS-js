#!/usr/bin/env node

// src/index.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var MAX_SCAN_APPS = 3000;
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
      electronApps.push(app.appPath);
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
    electronApps: sortPaths(electronApps),
    rosetta2Apps: sortPaths(rosetta2Apps),
    vscodeApps: sortPaths(vscodeApps)
  };
  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printHumanReadable(result);
}
function printHelp() {
  console.log(`safariyyds - Scan your Mac for Electron, Rosetta2, and VSCode applications

Usage:
  npx safariyyds
  npx safariyyds --json
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
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to scan applications: ${message}`);
  process.exitCode = 1;
});
