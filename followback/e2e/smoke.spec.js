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

/** A ZIP whose files carry a given export date. */
async function datedZip(when, followers, following) {
  const z = new JSZip();
  const d = z.folder("connections").folder("followers_and_following");
  const rows = (us) =>
    us.map((u) => ({
      string_list_data: [{ href: "https://www.instagram.com/" + u, value: u, timestamp: 1700000000 }]
    }));
  d.file("followers_1.json", JSON.stringify(rows(followers)), { date: when });
  d.file("following.json", JSON.stringify({ relationships_following: rows(following) }), { date: when });
  return z.generateAsync({ type: "nodebuffer" });
}

test("two ZIPs at once show who unfollowed in between", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#f", [
    {
      name: "new.zip",
      mimeType: "application/zip",
      buffer: await datedZip(new Date(2026, 10, 1, 12), ["a", "fresh"], ["a", "gone"])
    },
    {
      name: "old.zip",
      mimeType: "application/zip",
      buffer: await datedZip(new Date(2026, 8, 1, 12), ["a", "gone"], ["a", "gone"])
    }
  ]);
  await expect(page.locator("#msg")).toContainText("Loaded 2 exports");
  await expect(page.locator('#tabs [aria-selected="true"]')).toHaveText("Unfollowed you (1)");
  await expect(page.locator("#list")).toContainText("@gone");
});

test("the summary image is a real PNG with no usernames in it", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#f", { name: "export.zip", mimeType: "application/zip", buffer: await exportZip() });
  await expect(page.locator("#out")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#img")]);
  expect(dl.suggestedFilename()).toMatch(/^followback-summary-.*\.png$/);
  const buf = readFileSync(await dl.path());
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.toString("latin1")).not.toContain("erin");
});

test("a ZIP shared to the installed app opens, and is not kept", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // A same-origin page without the app's CSP, controlled by the service
  // worker, stands in for Android's share sheet posting the file.
  await page.goto("/icon.svg");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const zip = Array.from(await exportZip());
  const status = await page.evaluate(async (bytes) => {
    const form = new FormData();
    form.append("files", new File([new Uint8Array(bytes)], "shared.zip", { type: "application/zip" }));
    const res = await fetch("/share-target", { method: "POST", body: form, redirect: "manual" });
    return res.type === "opaqueredirect" ? 303 : res.status;
  }, zip);
  expect(status).toBe(303);
  await page.goto("/?share=1");
  await expect(page.locator("#out")).toBeVisible();
  await expect(page.locator("#msg")).toContainText("Opened the file you shared");
  await expect(page).toHaveURL(/\/$/);
  const left = await page.evaluate(async () => (await caches.keys()).filter((k) => /inbox/.test(k)));
  expect(left).toEqual([]);
});

test("Hindi from the address survives a refresh without storing anything", async ({ page }) => {
  await page.goto("/?lang=hi");
  await expect(page.locator("#drop")).toContainText("Instagram ZIP यहाँ छोड़ें");
  await page.selectOption("#lang", "or");
  await expect(page).toHaveURL(/lang=or/);
  await page.reload();
  await expect(page.locator("#drop")).toContainText("ଏଠାରେ ପକାନ୍ତୁ");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
