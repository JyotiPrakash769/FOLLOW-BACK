import { describe, it, expect } from "vitest";
import { encryptText, decryptText, isEncrypted, canEncrypt } from "../src/crypt.js";

describe("password-protected backups", () => {
  it("round-trips with the right password", async () => {
    expect(canEncrypt()).toBe(true);
    const plain = JSON.stringify({ v: 2, names: ["alice", "bob"] });
    const locked = await encryptText(plain, "correct horse");
    expect(isEncrypted(locked)).toBe(true);
    expect(locked).not.toContain("alice");
    const r = await decryptText(locked, "correct horse");
    expect(r).toEqual({ ok: true, text: plain });
  });

  it("refuses a wrong password without throwing", async () => {
    const locked = await encryptText("secret list", "right");
    const r = await decryptText(locked, "wrong");
    expect(r.ok).toBe(false);
  });

  it("uses a fresh salt and iv each time", async () => {
    const a = JSON.parse(await encryptText("same", "pw"));
    const b = JSON.parse(await encryptText("same", "pw"));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("tells a plain backup apart from a locked one", () => {
    expect(isEncrypted('{"v":2,"names":[]}')).toBe(false);
    expect(isEncrypted("not json")).toBe(false);
  });

  it("rejects a tampered file", async () => {
    const j = JSON.parse(await encryptText("data", "pw"));
    j.data = j.data.slice(0, -4) + (j.data.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect((await decryptText(JSON.stringify(j), "pw")).ok).toBe(false);
  });
});
