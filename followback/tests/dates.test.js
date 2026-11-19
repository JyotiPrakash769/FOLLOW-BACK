import { describe, it, expect } from "vitest";
import { parseDate, monthIndex, findDate, normalizeDigits } from "../src/parse.js";

const ymd = (sec) => {
  const d = new Date(sec * 1000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

describe("parseDate across locales", () => {
  const cases = [
    ["Nov 12, 2024 10:23 am", "2024-11-12", "English with time"],
    ["November 12, 2024", "2024-11-12", "English long"],
    ["12 November 2024", "2024-11-12", "day first"],
    ["2024-03-02", "2024-03-02", "ISO"],
    ["2024-03-02T10:00:00Z", "2024-03-02", "ISO with time"],
    ["25/12/2024", "2024-12-25", "unambiguous day-first"],
    ["2024. 11. 12.", "2024-11-12", "Korean numeric"],
    ["2024年11月12日", "2024-11-12", "Japanese"],
    ["12 नवंबर 2024", "2024-11-12", "Hindi"],
    ["1 ଜାନୁଆରୀ 2025", "2025-01-01", "Odia"],
    ["25 de diciembre de 2024", "2024-12-25", "Spanish"],
    ["15 décembre 2023", "2023-12-15", "French"],
    ["12 ноября 2024", "2024-11-12", "Russian"],
    ["3 Mart 2024", "2024-03-03", "Turkish"],
    ["١٢ نوفمبر ٢٠٢٤", "2024-11-12", "Arabic digits + month"]
  ];
  for (const [input, want, label] of cases) {
    it(label, () => expect(ymd(parseDate(input))).toBe(want));
  }

  it("returns 0 for unparseable input", () => {
    for (const bad of ["", "   ", "nonsense", "just 2024", "hello world"]) expect(parseDate(bad)).toBe(0);
  });

  it("does not guess an ambiguous numeric date", () => {
    expect(parseDate("03/04/2024")).toBe(0); // could be Mar 4 or Apr 3
  });

  it("ignores a long blob of unrelated text", () => {
    const blob = "x".repeat(300) + " and some 12 numbers 99 scattered 7 about";
    expect(parseDate(blob)).toBe(0);
  });
});

describe("monthIndex", () => {
  it("knows month names in several languages", () => {
    expect(monthIndex("Nov")).toBe(10);
    expect(monthIndex("november")).toBe(10);
    expect(monthIndex("diciembre")).toBe(11);
    expect(monthIndex("नवंबर")).toBe(10);
  });
  it("rejects bare numbers and junk", () => {
    expect(monthIndex("12")).toBe(null);
    expect(monthIndex("")).toBe(null);
    expect(monthIndex("xyz")).toBe(null);
  });
});

describe("findDate", () => {
  it("locates a date embedded in surrounding text", () => {
    expect(ymd(findDate("followed you on Nov 12, 2024 at 10am, remove?"))).toBe("2024-11-12");
    expect(findDate("no date here at all")).toBe(0);
  });
});

describe("normalizeDigits", () => {
  it("converts native numerals to ASCII", () => {
    expect(normalizeDigits("١٢٣")).toBe("123"); // Arabic
    expect(normalizeDigits("१२३")).toBe("123"); // Devanagari
    expect(normalizeDigits("abc")).toBe("abc");
  });
});
