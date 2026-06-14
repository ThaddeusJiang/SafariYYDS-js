import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectRuntime, type AppInfo } from "./detection.js";
import { buildDefaultScanRoots, discoverScanTargets } from "./discovery.js";
import { copyImageToClipboard, createReportImage, openImage } from "./report.js";

const execFileAsync = promisify(execFile);
const MAX_SCAN_TARGETS = 5000;

type ScanResult = {
  scannedAt: string;
  machineArch: string;
  roots: string[];
  totals: {
    scannedTargets: number;
    scannedApps: number;
    chromiumApps: number;
    electronApps: number;
    rosetta2Apps: number;
    vscodeApps: number;
  };
  chromiumApps: string[];
  electronApps: string[];
  rosetta2Apps: string[];
  vscodeApps: string[];
};

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("-h") || args.has("--help")) {
    printHelp();
    return;
  }

  const scanRoots = await buildDefaultScanRoots();
  const roots = scanRoots.map((root) => root.path);
  const apps = await discoverScanTargets(scanRoots, MAX_SCAN_TARGETS);
  const machineArch = os.arch();

  const chromiumApps: AppInfo[] = [];
  const electronApps: AppInfo[] = [];
  const rosetta2Apps: string[] = [];
  const vscodeApps: string[] = [];

  for (const app of apps) {
    const [runtime, isVSCode, needsRosetta] = await Promise.all([
      detectRuntime(app),
      detectVSCode(app),
      detectNeedsRosetta2(app, machineArch)
    ]);

    if (runtime.isChromium) chromiumApps.push(app);
    if (runtime.isElectron) electronApps.push(app);
    if (isVSCode) vscodeApps.push(app.appPath);
    if (needsRosetta) rosetta2Apps.push(app.appPath);
  }

  const result: ScanResult = {
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
    console.log(`\nReport image: ${reportPath}`);
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

async function detectVSCode(app: AppInfo): Promise<boolean> {
  const name = app.appName.toLowerCase();
  const bundle = (app.bundleIdentifier || "").toLowerCase();

  return (
    name.includes("visual studio code") ||
    name.includes("vscode") ||
    name.includes("vscodium") ||
    name.includes("cursor") ||
    name.includes("windsurf") ||
    bundle.includes("com.microsoft.vscode") ||
    bundle.includes("vscodium") ||
    bundle.includes("cursor") ||
    bundle.includes("windsurf")
  );
}

async function detectNeedsRosetta2(app: AppInfo, machineArch: string): Promise<boolean> {
  if (machineArch !== "arm64") return false;
  if (!app.executablePath) return false;

  try {
    const { stdout } = await execFileAsync("/usr/bin/lipo", ["-archs", app.executablePath], {
      timeout: 1500,
      maxBuffer: 1024 * 32
    });

    const archs = stdout
      .trim()
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (archs.length === 0) return false;

    const hasArm64 = archs.includes("arm64") || archs.includes("arm64e");
    const hasX64 = archs.includes("x86_64") || archs.includes("i386");

    return hasX64 && !hasArm64;
  } catch {
    return false;
  }
}

function sortPaths(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function printHumanReadable(result: ScanResult) {
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

function printSection(title: string, entries: string[]) {
  console.log(`\n${title} (${entries.length})`);
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
