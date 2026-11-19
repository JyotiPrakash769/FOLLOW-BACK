import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { gather } from "../src/gather.js";

const fx = (n) => readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
const file = (name, text) => new File([text], name, { type: "text/plain" });
const names = (rows) => rows.map((r) => r.u);

async function zipOf(entries, name) {
  const z = new JSZip();
  const dir = z.folder("connections").folder("followers_and_following");
  for (const [n, text] of entries) dir.file(n, text);
  z.folder("messages").folder("inbox").file("someone.json", '{"messages":[]}');
  z.folder("threads").file("followers_1.json", '[{"string_list_data":[{"value":"thread_only"}]}]');
  const buf = await z.generateAsync({ type: "nodebuffer" });
  return new File([buf], name || "instagram-export.zip");
}

describe("gather", () => {
  it("reads loose JSON files", async () => {
    const r = await gather([file("followers_1.json", fx("followers_1.json")), file("following.json", fx("following.json"))], null);
    expect(names(r.payload.followers)).toEqual(["alice", "bob_the.builder", "carol"]);
    expect(names(r.payload.following)).toEqual(["alice", "erin"]);
    expect(r.counts.followers).toBe(3);
  });

  it("merges a split follower list and keeps the earliest timestamp", async () => {
    const r = await gather([
      file("followers_1.json", fx("followers_1.json")),
      file("followers_2.json", fx("followers_2.json")),
      file("following.json", fx("following.json"))
    ], null);
    expect(names(r.payload.followers).sort()).toEqual(["alice", "bob_the.builder", "carol", "dave"]);
    const alice = r.payload.followers.find((x) => x.u === "alice");
    expect(alice.t).toBe(1690000000); // not the 1700000000 from followers_1
  });

  it("reads a real ZIP, including the extra lists, and ignores unrelated folders", async () => {
    const z = await zipOf([
      ["followers_1.json", fx("followers_1.json")],
      ["following.json", fx("following.json")],
      ["pending_follow_requests.json", fx("pending_follow_requests.json")],
      ["blocked_profiles.json", fx("blocked_profiles.json")],
      ["recently_unfollowed_profiles.json", fx("recently_unfollowed_profiles.json")]
    ]);
    const r = await gather([z], JSZip);
    expect(names(r.payload.followers)).toContain("alice");
    expect(names(r.payload.pending)).toEqual(["frank"]);
    expect(names(r.payload.blocked)).toEqual(["spammer_99"]);
    expect(names(r.payload.unfollowed)).toEqual(["gina"]);
    expect(names(r.payload.followers)).not.toContain("thread_only");
    expect(r.considered.some((n) => /messages/.test(n))).toBe(false);
  });

  it("reports progress for every recognised file", async () => {
    const seen = [];
    await gather([file("followers_1.json", fx("followers_1.json")), file("following.json", fx("following.json"))],
      null, (p) => seen.push(p.done + "/" + p.total));
    expect(seen).toEqual(["0/2", "1/2", "2/2"]);
  });

  it("returns empty lists when nothing is recognised", async () => {
    const r = await gather([file("holiday.jpg", "not json")], null);
    expect(r.payload.followers).toEqual([]);
    expect(r.considered).toEqual([]);
  });

  it("explains itself when a ZIP arrives without JSZip", async () => {
    await expect(gather([new File(["x"], "a.zip")], null)).rejects.toThrow(/ZIP support/);
  });

  it("handles an HTML export", async () => {
    const r = await gather([file("followers.html", fx("followers.html")), file("following.json", fx("following.json"))], null);
    expect(names(r.payload.followers)).toEqual(["jack", "kate_01"]);
  });
});
