import { describe, it, expect } from "vitest";
import { cardLines } from "../src/card.js";
import { t } from "../src/i18n.js";

describe("summary image", () => {
  const base = { notBack: 41, followers: 312, following: 280, mutual: 239, date: "20/11/2026", t };

  it("shows counts only, never usernames", () => {
    const L = cardLines({ ...base, since: { d: "20/10/2026", g: 12, l: 3 } });
    expect(L.big).toBe("41");
    expect(L.stats.map((s) => s[0])).toEqual(["312", "280", "239"]);
    expect(L.since).toBe("since 20/10/2026: +12 new, -3 unfollowed");
    expect(L.footer).toContain("20/11/2026");
  });

  it("leaves out the change line for a single snapshot", () => {
    expect(cardLines({ ...base, since: null }).since).toBe("");
  });
});
