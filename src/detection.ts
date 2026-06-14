import { promises as fs } from "node:fs";
import path from "node:path";

export type ScanTargetKind = "app" | "executable";
export type ScanSourceKind = "applications" | "browser-cache" | "npm-package";

export type AppInfo = {
  appPath: string;
  appName: string;
  executablePath: string | null;
  bundleIdentifier: string | null;
  targetKind?: ScanTargetKind;
  sourceKind?: ScanSourceKind;
};

export type RuntimeDetection = {
  isChromium: boolean;
  isElectron: boolean;
};

const MAX_EVIDENCE_DEPTH = 12;
const MAX_EVIDENCE_ENTRIES = 10000;
const CHROMIUM_SCORE_THRESHOLD = 5;
const ELECTRON_SCORE_THRESHOLD = 5;

type EvidenceScore = {
  chromium: number;
  electron: number;
  entriesSeen: number;
};

export async function detectRuntime(app: AppInfo): Promise<RuntimeDetection> {
  const score = await scoreRuntimeEvidence(app);

  return {
    isChromium: score.chromium >= CHROMIUM_SCORE_THRESHOLD || score.electron >= ELECTRON_SCORE_THRESHOLD,
    isElectron: score.electron >= ELECTRON_SCORE_THRESHOLD
  };
}

export async function detectElectron(app: AppInfo): Promise<boolean> {
  return (await detectRuntime(app)).isElectron;
}

export async function detectChromium(app: AppInfo): Promise<boolean> {
  return (await detectRuntime(app)).isChromium;
}

async function scoreRuntimeEvidence(app: AppInfo): Promise<EvidenceScore> {
  const score: EvidenceScore = { chromium: 0, electron: 0, entriesSeen: 0 };
  const startStat = await statOrNull(app.appPath);
  if (!startStat) return score;

  scorePathEvidence(app.appPath, startStat.isDirectory(), app, score);

  if (startStat.isFile()) {
    return score;
  }

  const queue: Array<{ targetPath: string; depth: number }> = [{ targetPath: app.appPath, depth: 0 }];

  while (queue.length > 0 && score.entriesSeen < MAX_EVIDENCE_ENTRIES) {
    const current = queue.shift();
    if (!current || current.depth >= MAX_EVIDENCE_DEPTH) continue;

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

      if (score.entriesSeen >= MAX_EVIDENCE_ENTRIES) break;
      if (!isDirectory) continue;

      queue.push({ targetPath: fullPath, depth: current.depth + 1 });
    }
  }

  return score;
}

function scorePathEvidence(
  targetPath: string,
  isDirectory: boolean,
  app: AppInfo,
  score: EvidenceScore
): void {
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

  if (
    lowerName === "chrome_100_percent.pak" ||
    lowerName === "chrome_200_percent.pak" ||
    lowerName === "resources.pak"
  ) {
    score.chromium += 1;
  }

  if (
    lowerName === "libegl.dylib" ||
    lowerName === "libglesv2.dylib" ||
    lowerName === "privacysandboxattestationspreloaded"
  ) {
    score.chromium += 1;
  }

  if (isDirectory && /(\(|\s)(gpu|renderer)(\)|\s)/i.test(name) && lowerName.endsWith(".app")) {
    score.chromium += 2;
  }
}

function hasChromiumCacheContext(app: AppInfo): boolean {
  const lowerPath = app.appPath.toLowerCase();
  return (
    app.sourceKind === "browser-cache" ||
    lowerPath.includes("/ms-playwright/") ||
    lowerPath.includes("/puppeteer/") ||
    lowerPath.includes("/chromium-") ||
    lowerPath.includes("/chrome/")
  );
}

function hasNpmContext(app: AppInfo): boolean {
  return app.sourceKind === "npm-package" || app.appPath.toLowerCase().includes("/node_modules/");
}

function isChromiumExecutableName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName === "chromium" ||
    lowerName === "chrome" ||
    lowerName === "chrome-headless-shell" ||
    lowerName === "google chrome for testing"
  );
}

function isElectronExecutableName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName === "electron";
}

async function statOrNull(targetPath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}
