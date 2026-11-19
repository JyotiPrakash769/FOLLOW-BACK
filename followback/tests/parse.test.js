import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { kind, isHandle, handleFromHref, extract, extractJson, extractHtml } from "../src/parse.js";

const fx = (n) => readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
const names = (rows) => rows.map((r) => r.u);

describe("kind", () => {
  it("maps the files we care about", () => {
    expect(kind("connections/followers_and_following/followers_1.json")).toBe("followers");
    expect(kind("followers.json")).toBe("followers");
    expect(kind("following.html")).toBe("following");
    expect(kind("pending_follow_requests.json")).toBe("pending");
    expect(kind("recently_unfollowed_profiles.json")).toBe("unfollowed");
    expect(kind("blocked_profiles.json")).toBe("blocked");
    expect(kind("restricted_profiles.json")).toBe("restricted");
    expect(kind("close_friends.json")).toBe("closefriends");
    expect(kind("follow_requests_you've_received.json")).toBe("received");
  });
  it("ignores everything else, including the Threads lists", () => {
    expect(kind("messages/inbox/x.json")).toBe(null);
    expect(kind("your_instagram_activity/likes.json")).toBe(null);
    expect(kind("threads/followers_1.json")).toBe(null);
  });
});

describe("handle validation", () => {
  it("accepts real handles", () => {
    for (const u of ["alice", "bob_the.builder", "a", "x".repeat(30), "_private_"]) expect(isHandle(u)).toBe(true);
  });
  it("rejects routes, junk and over-long names", () => {
    for (const u of ["p", "reel", "explore", "accounts", "", "...", "x".repeat(31), "has space", "bad/slash"]) {
      expect(isHandle(u)).toBe(false);
    }
  });
  it("only takes single-segment profile URLs", () => {
    expect(handleFromHref("https://www.instagram.com/alice")).toBe("alice");
    expect(handleFromHref("https://instagram.com/alice/")).toBe("alice");
    expect(handleFromHref("https://www.instagram.com/_u/alice/")).toBe("alice");
    expect(handleFromHref("https://www.instagram.com/alice?hl=en")).toBe("alice");
    expect(handleFromHref("https://www.instagram.com/p/C123/")).toBe(null);
    expect(handleFromHref("https://www.instagram.com/alice/reels/")).toBe(null);
    expect(handleFromHref("https://www.instagram.com/")).toBe(null);
    expect(handleFromHref("https://example.com/alice")).toBe(null);
  });
});

describe("extractJson", () => {
  it("reads the classic string_list_data shape with timestamps", () => {
    const rows = extractJson(fx("followers_1.json"));
    expect(names(rows)).toEqual(["alice", "bob_the.builder", "carol"]);
    expect(rows[0].t).toBe(1700000000);
  });
  it("reads a wrapped list", () => {
    expect(names(extractJson(fx("following.json")))).toEqual(["alice", "erin"]);
  });
  it("falls back to title when value is empty, as blocked_profiles does", () => {
    const rows = extractJson(fx("blocked_profiles.json"));
    expect(names(rows)).toEqual(["spammer_99"]);
    expect(rows[0].t).toBe(1698000000);
  });
  it("reads the newer label_values shape, including an ISO date and an href-only entry", () => {
    const rows = extractJson(fx("label_values_following.json"));
    expect(names(rows)).toEqual(["henry", "ivy"]);
    expect(rows[0].t).toBe(Math.floor(Date.parse("2024-03-02T10:00:00Z") / 1000));
    expect(rows[1].t).toBe(1709000000);
  });
  it("normalises millisecond timestamps to seconds", () => {
    const rows = extractJson(JSON.stringify([{ string_list_data: [{ value: "zed", timestamp: 1700000000000 }] }]));
    expect(rows[0].t).toBe(1700000000);
  });
  it("deduplicates and keeps a timestamp found on a later duplicate", () => {
    const rows = extractJson(
      JSON.stringify([
        { string_list_data: [{ value: "dup" }] },
        { string_list_data: [{ value: "DUP", timestamp: 123 }] }
      ])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].t).toBe(123);
  });
});

describe("extractHtml", () => {
  const rows = extractHtml(fx("followers.html"));
  it("picks up only real profile anchors", () => {
    expect(names(rows)).toEqual(["jack", "kate_01"]);
  });
  it("ignores nav chrome, posts, reels and nested paths", () => {
    const n = names(rows);
    for (const bad of ["p", "reel", "explore", "accounts", "C1234567", "C999"]) expect(n).not.toContain(bad);
  });
  it("ignores instagram.com mentioned in plain text rather than an anchor", () => {
    expect(names(rows)).not.toContain("ghost_account");
  });
  it("reads the date next to each entry, at day resolution", () => {
    expect(rows[0].t).toBe(Math.floor(new Date(2024, 10, 12).getTime() / 1000));
    expect(rows[1].t).toBe(Math.floor(new Date(2024, 11, 1).getTime() / 1000));
  });
});

describe("extract dispatch", () => {
  it("routes by content, not extension", () => {
    expect(names(extract(fx("followers_1.json")))).toContain("alice");
    expect(names(extract(fx("followers.html")))).toContain("jack");
  });
  it("falls back to the HTML path when JSON is malformed", () => {
    expect(names(extract('{"broken": <a href="https://www.instagram.com/mia">mia</a>'))).toEqual(["mia"]);
  });
  it("returns nothing for empty input", () => {
    expect(extract("")).toEqual([]);
    expect(extract("   ")).toEqual([]);
  });
});
