import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { detectChromium } from "./detection.js";
import { discoverScanTargets } from "./discovery.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("detectChromium", () => {
  test("detects Electron apps as Chromium apps", async () => {
    const app = await createApp({
      name: "Electron Note",
      frameworks: ["Electron Framework.framework"]
    });

    await expect(detectChromium(app)).resolves.toBe(true);
  });

  test("detects CEF apps as Chromium apps", async () => {
    const app = await createApp({
      name: "CEF Tool",
      frameworks: ["Chromium Embedded Framework.framework"]
    });

    await expect(detectChromium(app)).resolves.toBe(true);
  });

  test("detects Chromium browsers by runtime evidence", async () => {
    const app = await createApp({
      name: "Google Chrome",
      frameworks: [
        "Google Chrome for Testing Framework.framework"
      ],
      runtimeEvidence: true
    });

    await expect(detectChromium(app)).resolves.toBe(true);
  });

  test("detects Dia-style apps by Chromium runtime evidence", async () => {
    const app = await createApp({
      name: "Dia",
      frameworks: ["ArcCore.framework"],
      runtimeEvidence: true
    });

    await expect(detectChromium(app)).resolves.toBe(true);
  });

  test("detects nested Chromium runtime evidence", async () => {
    const app = await createApp({
      name: "ChatGPT Atlas",
      nestedApps: [
        {
          name: "ChatGPT Atlas",
          bundleIdentifier: "com.example.atlas.web",
          frameworks: ["ChatGPT Atlas Framework.framework"],
          runtimeEvidence: true
        }
      ]
    });

    await expect(detectChromium(app)).resolves.toBe(true);
  });

  test("does not classify Safari as a Chromium app", async () => {
    const app = await createApp({
      name: "Safari",
      bundleIdentifier: "com.apple.Safari"
    });

    await expect(detectChromium(app)).resolves.toBe(false);
  });

  test("does not classify unrelated apps with partial browser-name matches", async () => {
    const app = await createApp({
      name: "Arcade Builder",
      bundleIdentifier: "com.example.arcade-builder"
    });

    await expect(detectChromium(app)).resolves.toBe(false);
  });

  test("does not classify generic browser frameworks as Chromium apps", async () => {
    const app = await createApp({
      name: "Documentation Browser",
      frameworks: ["Browser Framework.framework"]
    });

    await expect(detectChromium(app)).resolves.toBe(false);
  });

  test("does not classify Playwright WebKit as a Chromium app", async () => {
    const app = await createApp({
      name: "Playwright",
      frameworks: ["WebKit.framework", "JavaScriptCore.framework", "WebCore.framework"]
    });

    await expect(detectChromium(app)).resolves.toBe(false);
  });
});

describe("discoverScanTargets", () => {
  test("finds app bundles and Chromium executables in browser cache roots", async () => {
    const root = await createTempRoot();
    const chromeApp = path.join(
      root,
      "ms-playwright",
      "chromium-1234",
      "chrome-mac-arm64",
      "Google Chrome for Testing.app"
    );
    const headlessShell = path.join(
      root,
      "puppeteer",
      "chrome-headless-shell",
      "mac_arm-1234",
      "chrome-headless-shell-mac-arm64",
      "chrome-headless-shell"
    );

    await createAppBundle(chromeApp, {
      executableName: "Google Chrome for Testing",
      bundleIdentifier: "com.example.chrome-for-testing"
    });
    await fs.mkdir(path.dirname(headlessShell), { recursive: true });
    await fs.writeFile(headlessShell, "");
    await fs.chmod(headlessShell, 0o755);

    const targets = await discoverScanTargets([
      { path: path.join(root, "ms-playwright"), kind: "browser-cache" },
      { path: path.join(root, "puppeteer"), kind: "browser-cache" }
    ]);

    expect(targets.map((item) => item.appPath).sort()).toEqual([chromeApp, headlessShell].sort());
  });

  test("does not descend into application bundles while discovering installed apps", async () => {
    const root = await createTempRoot();
    const productApp = path.join(root, "Product.app");
    const helperApp = path.join(productApp, "Contents", "Frameworks", "Product Framework.framework", "Versions", "A", "Helpers", "Product Helper (Renderer).app");

    await createAppBundle(productApp);
    await createAppBundle(helperApp);

    const targets = await discoverScanTargets([{ path: root, kind: "applications" }]);

    expect(targets.map((item) => item.appPath)).toEqual([productApp]);
  });

  test("finds Electron app bundles installed through npm packages", async () => {
    const root = await createTempRoot();
    const electronApp = path.join(root, "electron", "dist", "Electron.app");
    await createAppBundle(electronApp, {
      frameworks: ["Electron Framework.framework"]
    });

    const targets = await discoverScanTargets([{ path: root, kind: "npm-package" }]);

    expect(targets.map((item) => item.appPath)).toEqual([electronApp]);
  });
});

async function createApp(options: {
  name: string;
  bundleIdentifier?: string;
  frameworks?: string[];
  nestedApps?: Array<{
    name: string;
    bundleIdentifier?: string;
    frameworks?: string[];
    runtimeEvidence?: boolean;
  }>;
  runtimeEvidence?: boolean;
}) {
  const root = await createTempRoot();

  const appPath = path.join(root, `${options.name}.app`);
  await createAppBundle(appPath, options);

  for (const nested of options.nestedApps || []) {
    await createAppBundle(path.join(appPath, "Contents", "Support", `${nested.name}.app`), nested);
  }

  return {
    appPath,
    appName: options.name,
    executablePath: null,
    bundleIdentifier: options.bundleIdentifier || null
  };
}

async function createTempRoot(): Promise<string> {
  const root = path.join(tmpdir(), `safariyyds-test-${randomUUID()}`);
  tempRoots.push(root);
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function createAppBundle(appPath: string, options: {
  name?: string;
  bundleIdentifier?: string;
  executableName?: string;
  frameworks?: string[];
  runtimeEvidence?: boolean;
} = {}): Promise<void> {
  const appName = options.name || path.basename(appPath, ".app");
  const executableName = options.executableName || appName;
  const contentsDir = path.join(appPath, "Contents");
  const frameworksDir = path.join(contentsDir, "Frameworks");
  await fs.mkdir(path.join(contentsDir, "MacOS"), { recursive: true });
  await fs.mkdir(frameworksDir, { recursive: true });
  await fs.writeFile(path.join(contentsDir, "Info.plist"), plist({
    CFBundleExecutable: executableName,
    CFBundleIdentifier: options.bundleIdentifier || "com.example.app"
  }));
  await fs.writeFile(path.join(contentsDir, "MacOS", executableName), "");

  for (const framework of options.frameworks || []) {
    const frameworkDir = path.join(frameworksDir, framework, "Versions", "A");
    await fs.mkdir(path.join(frameworkDir, "Resources"), { recursive: true });

    if (options.runtimeEvidence) {
      await fs.writeFile(path.join(frameworkDir, "Resources", "chrome_100_percent.pak"), "");
      await fs.writeFile(path.join(frameworkDir, "Resources", "resources.pak"), "");
      await fs.mkdir(path.join(frameworkDir, "Libraries", "PrivacySandboxAttestationsPreloaded"), { recursive: true });
      await fs.writeFile(path.join(frameworkDir, "Libraries", "libEGL.dylib"), "");
      await fs.writeFile(path.join(frameworkDir, "Libraries", "libGLESv2.dylib"), "");
      await fs.mkdir(path.join(frameworkDir, "Helpers", `${appName} Helper (GPU).app`), { recursive: true });
      await fs.mkdir(path.join(frameworkDir, "Helpers", `${appName} Helper (Renderer).app`), { recursive: true });
      await fs.writeFile(path.join(frameworkDir, "Helpers", "chrome_crashpad_handler"), "");
    }
  }
}

function plist(values: Record<string, string>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(values).map(([key, value]) => `  <key>${key}</key><string>${value}</string>`).join("\n")}
</dict>
</plist>
`;
}
