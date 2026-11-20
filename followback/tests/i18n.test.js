import { describe, it, expect, afterEach } from "vitest";
import { STRINGS, t, setLang, pickLang } from "../src/i18n.js";

afterEach(() => setLang("en"));

describe("interface languages", () => {
  it("translates every English key into Hindi and Odia", () => {
    const keys = Object.keys(STRINGS.en).filter((k) => !["sortAz", "csv"].includes(k));
    for (const l of ["hi", "or"]) {
      const missing = keys.filter((k) => !STRINGS[l][k]);
      expect(missing, l + " is missing keys").toEqual([]);
    }
  });

  it("keeps the same placeholders in every language", () => {
    const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
    for (const l of ["hi", "or"])
      for (const [k, v] of Object.entries(STRINGS[l])) expect(holes(v), l + "." + k).toBe(holes(STRINGS.en[k]));
  });

  it("fills placeholders and falls back to English", () => {
    setLang("hi");
    expect(t("restored", { n: 3 })).toBe("बैकअप रिस्टोर हुआ (3 स्नैपशॉट)।");
    expect(t("csv")).toBe("CSV");
    setLang("xx");
    expect(t("clr")).toBe("Clear");
  });

  it("picks the language from the address first, then the browser", () => {
    expect(pickLang("?lang=or", ["en-US"])).toBe("or");
    expect(pickLang("", ["hi-IN", "en"])).toBe("hi");
    expect(pickLang("?lang=zz", ["fr"])).toBe("en");
  });
});
