/**
 * A shareable summary picture, drawn on a canvas in the page. It holds counts
 * only, never usernames, so it is safe to post. Nothing leaves the browser
 * until the person saves and shares the file themselves.
 */

/**
 * The lines on the card, kept apart from the drawing so they can be tested
 * without a canvas.
 * @param {{notBack: number, followers: number, following: number, mutual: number,
 *   since: {d: string, g: number, l: number} | null, date: string,
 *   t: (k: string, v?: Record<string, string | number>) => string}} d
 */
export function cardLines(d) {
  return {
    big: String(d.notBack),
    bigLabel: d.t("cardNotBack"),
    stats: [
      [String(d.followers), d.t("followers")],
      [String(d.following), d.t("following")],
      [String(d.mutual), d.t("mutual")]
    ],
    since: d.since ? d.t("cardSince", d.since) : "",
    footer: "FOLLOW/BACK  ·  " + d.date
  };
}

/**
 * Draw the card. Returns null when the browser has no 2D canvas.
 * @param {Document} doc
 * @param {Parameters<typeof cardLines>[0] & {colors: {bg: string, panel: string, ink: string, hot: string, soft: string}}} d
 * @returns {HTMLCanvasElement | null}
 */
export function summaryCard(doc, d) {
  const W = 1200,
    H = 630;
  const c = doc.createElement("canvas");
  c.width = W;
  c.height = H;
  let g;
  try {
    g = c.getContext("2d");
  } catch (e) {
    g = null; // jsdom and some locked-down browsers throw instead of returning null
  }
  if (!g) return null;
  const L = cardLines(d);
  const col = d.colors;
  const sans = '"Segoe UI", "Noto Sans", "Noto Sans Devanagari", "Noto Sans Oriya", system-ui, sans-serif';

  g.fillStyle = col.bg;
  g.fillRect(0, 0, W, H);
  // panel with a soft offset shadow, echoing the page
  g.fillStyle = col.soft;
  g.globalAlpha = 0.25;
  roundRect(g, 64, 64, W - 112, H - 112, 22);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = col.panel;
  roundRect(g, 48, 48, W - 112, H - 112, 22);
  g.fill();

  g.fillStyle = col.hot;
  g.font = "800 200px " + sans;
  g.textBaseline = "alphabetic";
  g.fillText(L.big, 96, 290);
  g.fillStyle = col.ink;
  g.font = "700 40px " + sans;
  g.fillText(L.bigLabel, 100, 350);

  let x = 100;
  for (const [n, label] of L.stats) {
    g.fillStyle = col.ink;
    g.font = "800 56px " + sans;
    g.fillText(n, x, 450);
    g.fillStyle = col.soft;
    g.font = "600 26px " + sans;
    g.fillText(label, x, 488);
    x += 300;
  }
  if (L.since) {
    g.fillStyle = col.ink;
    g.font = "600 28px " + sans;
    g.fillText(L.since, 100, 160);
  }
  g.fillStyle = col.soft;
  g.font = "600 24px " + sans;
  g.fillText(L.footer, 100, H - 92);
  return c;
}

/** @param {CanvasRenderingContext2D} g */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
