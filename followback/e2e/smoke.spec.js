import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(here, "../tests/fixtures/", n), "utf8");

/** Build an in-memory Instagram export ZIP as a Buffer for setInputFiles. */
async function exportZip() {
  const z = new JSZip();
  const d = z.folder("connections").folder("followers_and_following");
  d.file("followers_1.json", fx("followers_1.json"));
  d.file("following.json", fx("following.json"));
  d.file("blocked_profiles.json", fx("blocked_profiles.json"));
  return z.generateAsync({ type: "nodebuffer" });
}

test("page loads and makes no cross-origin requests", async ({ page }) => {
  const offsite = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== "http://localhost:8080" && u.protocol !== "data:" && u.protocol !== "blob:") offsite.push(r.url());
  });
  const cspViolations = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });

  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Follow");
  await page.waitForTimeout(500);
  expect(offsite, "page requested an external origin").toEqual([]);
  expect(cspViolations, "a CSP violation fired").toEqual([]);
});

test("uploading a ZIP shows the headline and lists", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#f", { name: "export.zip", mimeType: "application/zip", buffer: await exportZip() });
  await expect(page.locator("#out")).toBeVisible();
  await expect(page.locator("#big")).toHaveText("1"); // erin does not follow back
  await expect(page.locator("#sa")).toHaveText("3"); // followers
  await expect(page.locator("#tabs")).toContainText("Blocked (1)");
  await expect(page.locator("#list")).toContainText("@erin");
});

test("a reload starts over and saves nothing", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#f", { name: "export.zip", mimeType: "application/zip", buffer: await exportZip() });
  await expect(page.locator("#big")).toHaveText("1");
  await page.reload();
  await expect(page.locator("#drop")).toBeVisible();
  await expect(page.locator("#out")).toBeHidden();
  const saved = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
    return { localStorage: localStorage.length, indexedDB: dbs };
  });
  expect(saved).toEqual({ localStorage: 0, indexedDB: [] });
});

test("the inline script is CSP-pinned and runs", async ({ page }) => {
  await page.goto("/");
  // If the sha256 pin were wrong, the script would be blocked and the theme
  // button would do nothing.
  await page.setInputFiles("#f", { name: "export.zip", mimeType: "application/zip", buffer: await exportZip() });
  await page.click("#th");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
});
