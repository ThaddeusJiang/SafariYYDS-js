import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppInfo, ScanSourceKind, ScanTargetKind } from "./detection.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_TARGETS = 5000;
const MAX_APPLICATION_DEPTH = 8;
const MAX_CACHE_DEPTH = 10;

export type ScanRoot = {
  path: string;
  kind: ScanSourceKind;
};

export async function buildDefaultScanRoots(
  homeDir = os.homedir(),
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): Promise<ScanRoot[]> {
  const roots: ScanRoot[] = [
    { path: "/Applications", kind: "applications" },
    { path: path.join(homeDir, "Applications"), kind: "applications" },
    { path: "/System/Applications", kind: "applications" },
    { path: path.join(homeDir, "Library", "Caches", "ms-playwright"), kind: "browser-cache" },
    { path: path.join(homeDir, ".cache", "ms-playwright"), kind: "browser-cache" },
    { path: path.join(homeDir, ".cache", "puppeteer"), kind: "browser-cache" },
    { path: path.join(homeDir, "Library", "Caches", "puppeteer"), kind: "browser-cache" },
    { path: path.join(cwd, "node_modules", "electron", "dist"), kind: "npm-package" },
    { path: path.join(cwd, "node_modules", "playwright-core", ".local-browsers"), kind: "browser-cache" },
    { path: path.join(cwd, "node_modules", "playwright", ".local-browsers"), kind: "browser-cache" }
  ];

  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    roots.push({ path: env.PLAYWRIGHT_BROWSERS_PATH, kind: "browser-cache" });
  }

  if (env.PUPPETEER_CACHE_DIR) {
    roots.push({ path: env.PUPPETEER_CACHE_DIR, kind: "browser-cache" });
  }

  for (const globalRoot of await npmGlobalRoots()) {
    roots.push({ path: path.join(globalRoot, "electron", "dist"), kind: "npm-package" });
    roots.push({ path: path.join(globalRoot, "playwright-core", ".local-browsers"), kind: "browser-cache" });
    roots.push({ path: path.join(globalRoot, "playwright", ".local-browsers"), kind: "browser-cache" });
    roots.push({
      path: path.join(globalRoot, "@playwright", "test", "node_modules", "playwright-core", ".local-browsers"),
      kind: "browser-cache"
    });
  }

  return dedupeRoots(roots);
}

export async function discoverScanTargets(
  roots: ScanRoot[],
  maxTargets = DEFAULT_MAX_TARGETS
): Promise<AppInfo[]> {
  const targetPaths: Array<{ targetPath: string; kind: ScanTargetKind; sourceKind: ScanSourceKind }> = [];
  const seen = new Set<string>();

  for (const root of roots) {
    for (const candidate of await collectCandidatePaths(root)) {
      const key = await stablePathKey(candidate.targetPath);
      if (seen.has(key)) continue;
      seen.add(key);
      targetPaths.push(candidate);
      if (targetPaths.length >= maxTargets) {
        return readTargets(targetPaths);
      }
    }
  }

  return readTargets(targetPaths);
}

async function collectCandidatePaths(
  root: ScanRoot
): Promise<Array<{ targetPath: string; kind: ScanTargetKind; sourceKind: ScanSourceKind }>> {
  const candidates: Array<{ targetPath: string; kind: ScanTargetKind; sourceKind: ScanSourceKind }> = [];
  const rootStat = await statOrNull(root.path);
  if (!rootStat) return candidates;

  if (root.path.endsWith(".app") && rootStat.isDirectory()) {
    candidates.push({ targetPath: root.path, kind: "app", sourceKind: root.kind });
    return candidates;
  }

  if (rootStat.isFile() && isCandidateExecutable(root.path)) {
    candidates.push({ targetPath: root.path, kind: "executable", sourceKind: root.kind });
    return candidates;
  }

  if (!rootStat.isDirectory()) return candidates;

  const maxDepth = root.kind === "applications" ? MAX_APPLICATION_DEPTH : MAX_CACHE_DEPTH;
  const queue: Array<{ targetPath: string; depth: number }> = [{ targetPath: root.path, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;

    let entries;
    try {
      entries = await fs.readdir(current.targetPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current.targetPath, entry.name);

      if (entry.isDirectory() && entry.name.endsWith(".app")) {
        candidates.push({ targetPath: fullPath, kind: "app", sourceKind: root.kind });
        continue;
      }

      if (entry.isFile() && root.kind !== "applications" && isCandidateExecutable(entry.name)) {
        candidates.push({ targetPath: fullPath, kind: "executable", sourceKind: root.kind });
        continue;
      }

      if (!entry.isDirectory()) continue;
      if (shouldSkipDirectory(entry.name, root.kind)) continue;

      queue.push({ targetPath: fullPath, depth: current.depth + 1 });
    }
  }

  return candidates;
}

async function readTargets(
  targetPaths: Array<{ targetPath: string; kind: ScanTargetKind; sourceKind: ScanSourceKind }>
): Promise<AppInfo[]> {
  const targets: AppInfo[] = [];

  for (const item of targetPaths) {
    targets.push(await readTargetInfo(item.targetPath, item.kind, item.sourceKind));
  }

  return targets;
}

async function readTargetInfo(
  targetPath: string,
  targetKind: ScanTargetKind,
  sourceKind: ScanSourceKind
): Promise<AppInfo> {
  if (targetKind === "executable") {
    return {
      appPath: targetPath,
      appName: path.basename(targetPath),
      executablePath: targetPath,
      bundleIdentifier: null,
      targetKind,
      sourceKind
    };
  }

  const appName = path.basename(targetPath, ".app");
  const infoPlistPath = path.join(targetPath, "Contents", "Info.plist");
  const [executableName, bundleIdentifier] = await Promise.all([
    readPlistValue(infoPlistPath, "CFBundleExecutable"),
    readPlistValue(infoPlistPath, "CFBundleIdentifier")
  ]);

  return {
    appPath: targetPath,
    appName,
    executablePath: executableName ? path.join(targetPath, "Contents", "MacOS", executableName) : null,
    bundleIdentifier,
    targetKind,
    sourceKind
  };
}

async function readPlistValue(infoPlistPath: string, key: string): Promise<string | null> {
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

function isCandidateExecutable(targetPath: string): boolean {
  const name = path.basename(targetPath).toLowerCase();
  return (
    name === "chrome" ||
    name === "chromium" ||
    name === "chrome-headless-shell" ||
    name === "electron"
  );
}

function shouldSkipDirectory(name: string, kind: ScanSourceKind): boolean {
  if (name === "node_modules" && kind === "applications") return true;
  if (name.endsWith(".framework") && kind === "applications") return true;
  return false;
}

async function npmGlobalRoots(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("npm", ["root", "-g"], {
      timeout: 1500,
      maxBuffer: 1024 * 32
    });
    return stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function dedupeRoots(roots: ScanRoot[]): ScanRoot[] {
  const seen = new Set<string>();
  const deduped: ScanRoot[] = [];

  for (const root of roots) {
    const key = `${root.kind}:${path.resolve(root.path)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(root);
  }

  return deduped;
}

async function stablePathKey(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

async function statOrNull(targetPath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}
