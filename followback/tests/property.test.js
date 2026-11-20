import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { extract, isHandle, parseDate } from "../src/parse.js";

// Fixed seed: a failing case stays reproducible instead of flaking in CI.
const cfg = { numRuns: 500, seed: 1234 };

/**
 * A parser that eats untrusted third-party files is exactly where an
 * unanticipated input lives. These assert invariants over arbitrary input
 * rather than hand-picked cases.
 */
describe("extract never misbehaves on arbitrary input", () => {
  it("never throws and only ever emits valid handles", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const rows = extract(s);
        expect(Array.isArray(rows)).toBe(true);
        for (const r of rows) {
          expect(isHandle(r.u)).toBe(true);
          expect(typeof r.t).toBe("number");
          expect(r.t).toBeGreaterThanOrEqual(0);
        }
      }),
      cfg
    );
  });

  it("survives arbitrary JSON structures", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const rows = extract(JSON.stringify(v));
        for (const r of rows) expect(isHandle(r.u)).toBe(true);
      }),
      cfg
    );
  });

  it("extracts handles from synthetic string_list_data regardless of surrounding noise", () => {
    const handle = fc.stringMatching(/^[a-z][a-z0-9._]{0,20}[a-z0-9]$/);
    fc.assert(
      fc.property(fc.array(handle, { minLength: 1, maxLength: 20 }), (names) => {
        const unique = Array.from(new Set(names.map((n) => n.toLowerCase())));
        const json = JSON.stringify(unique.map((u) => ({ string_list_data: [{ value: u, timestamp: 1700000000 }] })));
        const got = extract(json).map((r) => r.u.toLowerCase());
        expect(got.sort()).toEqual(unique.sort());
      }),
      { ...cfg, numRuns: 200 }
    );
  });
});

describe("parseDate never throws", () => {
  it("returns a non-negative number for any input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const t = parseDate(s);
        expect(typeof t).toBe("number");
        expect(t).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(t)).toBe(true);
      }),
      cfg
    );
  });
});
