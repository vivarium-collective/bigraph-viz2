import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const bundle = readFileSync(resolve(__dirname, "../../dist/bigraph-viz2.iife.min.js"), "utf-8");
// CSS filename may be either bigraph-viz2.css or style.css depending on vite config
let css = "";
try { css = readFileSync(resolve(__dirname, "../../dist/bigraph-viz2.css"), "utf-8"); }
catch { css = readFileSync(resolve(__dirname, "../../dist/style.css"), "utf-8"); }
const spec = readFileSync(resolve(__dirname, "../fixtures/cell.json"), "utf-8");

const PAGE = (specJson: string) => `<!doctype html><html><head>
<style>${css}</style></head><body>
<div id="host" style="height:500px;width:800px"></div>
<script>${bundle}</script>
<script>
  BigraphViz.mount(document.getElementById("host"), ${specJson}, { id: "smoke" });
</script>
</body></html>`;

test("loads with no console errors and renders nodes", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.setContent(PAGE(spec));
  await page.waitForSelector(".bgv2-svg");
  const procCount = await page.locator(".bgv2-proc").count();
  expect(procCount).toBe(2);
  expect(errs).toEqual([]);
});

test("click on a process populates the inspector", async ({ page }) => {
  await page.setContent(PAGE(spec));
  await page.waitForSelector(".bgv2-svg");
  await page.locator('[data-bgv2-id="cell/diffusion"]').click();
  await expect(page.locator(".bgv2-inspector")).toContainText("ode.IonFlux");
});

test("double-click on a store collapses it and updates URL hash", async ({ page }) => {
  await page.setContent(PAGE(spec));
  await page.waitForSelector(".bgv2-svg");
  await page.locator('[data-bgv2-id="cell/cytoplasm"]').dblclick();
  await expect(page.locator(".bgv2-chip")).toHaveCount(1);
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("cell/cytoplasm");
});
