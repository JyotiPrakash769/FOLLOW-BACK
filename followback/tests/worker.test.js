/**
 * Runs the generated worker.js - the real build artifact, JSZip included - in a
 * sandbox with a fake `self`, so the worker message protocol is covered too.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import JSZip from "jszip";

const fx = (n) => readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
const src = readFileSync(new URL("../worker.js", import.meta.url), "utf8");

/** Boot worker.js and return a post() that resolves with the messages it sends. */
function spawn() {
  const sent = [];
  let resolveDone;
  const finished = new Promise((r) => {
    resolveDone = r;
  });
  const self = {
    // JSZip ships a setImmediate polyfill that probes the host for an old-IE
    // event API when it cannot find one; handing it Node's keeps it on the
    // fast path. A real worker has setImmediate-equivalents already.
    setImmediate,
    clearImmediate,
    addEventListener() {},
    removeEventListener() {},
    postMessage(m) {
      sent.push(m);
      if (m.type === "done" || m.type === "error") resolveDone(m);
    }
  };
  const ctx = createContext({
    self,
    globalThis: undefined,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    Promise,
    Uint8Array,
    ArrayBuffer,
    Buffer,
    TextDecoder,
    TextEncoder,
    File,
    Blob,
    Date,
    Math,
    JSON,
    Error,
    Object,
    Array,
    String,
    Number,
    RegExp,
    Map,
    Set
  });
  ctx.window = undefined;
  runInContext(src, ctx, { filename: "worker.js" });
  expect(typeof self.onmessage).toBe("function");
  return {
    async post(files) {
      self.onmessage({ data: { files } });
      const last = await finished;
      return { last, sent };
    }
  };
}

const file = (name, body) => new File([body], name, { type: "text/plain" });

describe("generated worker.js", () => {
  it("bundles JSZip rather than importing it", () => {
    expect(src).toMatch(/JSZip/);
    expect(src).not.toMatch(/cdnjs|unpkg|jsdelivr/);
    // No module syntax, and nothing fetched at runtime: it is one flat script.
    expect(src).not.toMatch(/^\s*(import|export)\s/m);
    expect(src).not.toMatch(/importScripts\s*\(\s*["']/);
  });

  it("parses loose files and reports progress, then done", async () => {
    const { last, sent } = await spawn().post([
      file("followers_1.json", fx("followers_1.json")),
      file("following.json", fx("following.json"))
    ]);
    expect(last.type).toBe("done");
    expect(last.result.payload.followers.map((r) => r.u)).toEqual(["alice", "bob_the.builder", "carol"]);
    expect(last.result.payload.following.map((r) => r.u)).toEqual(["alice", "erin"]);
    expect(sent.filter((m) => m.type === "progress").length).toBeGreaterThan(0);
    expect(sent.at(-2).total).toBe(2);
  });

  it("parses a real ZIP with its bundled JSZip", async () => {
    const z = new JSZip();
    const d = z.folder("connections").folder("followers_and_following");
    d.file("followers_1.json", fx("followers_1.json"));
    d.file("following.json", fx("following.json"));
    d.file("blocked_profiles.json", fx("blocked_profiles.json"));
    const buf = await z.generateAsync({ type: "nodebuffer" });
    const { last } = await spawn().post([new File([buf], "export.zip")]);
    expect(last.type).toBe("done");
    expect(last.result.payload.followers).toHaveLength(3);
    expect(last.result.payload.blocked.map((r) => r.u)).toEqual(["spammer_99"]);
  });

  it("reports a failure as an error message rather than dying silently", async () => {
    const { last } = await spawn().post([{ name: "broken.zip" }]);
    expect(last.type).toBe("error");
    expect(last.message).toBeTruthy();
  });
});
