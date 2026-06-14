import { describe, expect, test } from "bun:test";
import { buildRenderItems, buildReportSvg } from "./report.js";
import type { AppInfo } from "./detection.js";

describe("report rendering", () => {
  test("keeps every Chromium target in render items even when icons are missing", async () => {
    const apps = Array.from({ length: 18 }, (_, index) => createApp(index + 1));
    const items = await buildRenderItems(apps, async (app) => {
      return app.appName === "Chromium 7" ? null : `data:image/png;base64,${app.appName}`;
    });

    expect(items).toHaveLength(18);
    expect(items.map((item) => item.appName)).toContain("Chromium 7");
  });

  test("renders all 18 Chromium targets inside the report SVG", async () => {
    const apps = Array.from({ length: 18 }, (_, index) => createApp(index + 1));
    const items = await buildRenderItems(apps, async (app) => {
      return `data:image/png;base64,${app.appName}`;
    });
    const svg = buildReportSvg(18, items);

    for (let index = 1; index <= 18; index += 1) {
      expect(svg).toContain(`Chromium ${index}`);
    }

    expect(svg.match(/class="app-card"/g)).toHaveLength(18);
  });

  test("keeps 18 app cards inside the report viewport above the footer", async () => {
    const apps = Array.from({ length: 18 }, (_, index) => createApp(index + 1));
    const items = await buildRenderItems(apps, async () => null);
    const svg = buildReportSvg(18, items);
    const svgHeight = Number(svg.match(/<svg width="1600" height="(\d+)"/)?.[1]);
    const footerY = Number(svg.match(/<text x="800" y="(\d+)" text-anchor="middle" font-size="22"/)?.[1]);
    const cardRects = [
      ...svg.matchAll(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)" rx="18" fill="rgba\(255,255,255,0\.72\)"/g)
    ];

    expect(cardRects).toHaveLength(18);
    for (const rect of cardRects) {
      const bottom = Number(rect[1]) + Number(rect[2]);
      expect(bottom).toBeLessThan(footerY);
      expect(bottom).toBeLessThan(svgHeight);
    }
  });
});

function createApp(index: number): AppInfo {
  return {
    appPath: `/Applications/Chromium ${index}.app`,
    appName: `Chromium ${index}`,
    executablePath: null,
    bundleIdentifier: null,
    targetKind: "app",
    sourceKind: "applications"
  };
}
