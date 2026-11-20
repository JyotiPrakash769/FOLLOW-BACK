/**
 * Integration test: drives the real markup from index.html with the real UI
 * module, in jsdom. Catches the wiring mistakes unit tests cannot see.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const fx = (n) => readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

let dom, win, doc, confirmed;

function boot() {
  // Serve the shipped markup, minus the inlined bundle: the test imports the
  // modules directly so coverage and stack traces point at src/.
  dom = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/, ""), {
    url: "https://example.test/",
    pretendToBeVisual: true
  });
  win = dom.window;
  doc = win.document;

  const store = new Map();
  Object.defineProperty(win, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k)
    }
  });
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.confirm = () => confirmed;
  win.URL.createObjectURL = () => "blob:stub";
  win.__opened = [];
  win.open = (url) => {
    win.__opened.push(url);
    return { closed: false, focus() {} };
  };
  win.URL.revokeObjectURL = () => {};
  win.Element.prototype.scrollIntoView = function () {};
  win.Worker = undefined; // force the main-thread fallback
  // jsdom has neither IndexedDB nor CompressionStream, so the store falls back
  // to the localStorage adapter on its own - which is what we want to drive here.

  // Some of these (navigator) are getter-only on the Node global.
  for (const k of [
    "window",
    "document",
    "navigator",
    "Node",
    "Element",
    "HTMLElement",
    "File",
    "Blob",
    "FileList",
    "Event",
    "KeyboardEvent",
    "CustomEvent",
    "matchMedia",
    "localStorage",
    "getComputedStyle"
  ]) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: win[k] });
  }
  // The app calls the global URL, which here is Node's, not jsdom's. Node's
  // createObjectURL rejects jsdom Blobs, so stub it where the app looks.
  for (const k of ["createObjectURL", "revokeObjectURL"]) {
    Object.defineProperty(globalThis.URL, k, { configurable: true, writable: true, value: win.URL[k] });
  }
  globalThis.JSZip = JSZip;
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: win.location });
  globalThis.confirm = win.confirm;
  // Node's own timers stay in place: jsdom's setTimeout delegates to the global
  // one, so replacing it here makes jsdom recurse into itself.
}

const $ = (id) => doc.getElementById(id);
const text = (id) => ($(id) ? $(id).textContent : "");
/** Usernames only: the anchor also carries a date in a .d span. */
const rowNames = () =>
  Array.from($("list").querySelectorAll("a")).map((a) => {
    const c = a.cloneNode(true);
    c.querySelectorAll(".d").forEach((d) => d.remove());
    return c.textContent.trim();
  });
const tabNames = () => Array.from($("tabs").children).map((b) => b.textContent);
const activeTab = () => {
  const b = $("tabs").querySelector('[aria-selected="true"]');
  return b ? b.textContent : null;
};

/** Put files on the input and fire change, the way a real drop does. */
async function upload(files) {
  Object.defineProperty($("f"), "files", { configurable: true, value: files, writable: true });
  $("f").dispatchEvent(new win.Event("change"));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if (!$("out").hidden) break;
  }
  await new Promise((r) => setTimeout(r, 20));
}
/** Let queued microtasks (async persist, setFlag) settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));
const file = (name, body) => new win.File([body], name, { type: "text/plain" });
const basicExport = () => [
  file("followers_1.json", fx("followers_1.json")),
  file("following.json", fx("following.json"))
];

async function zipExport(extra) {
  const z = new JSZip();
  const d = z.folder("connections").folder("followers_and_following");
  d.file("followers_1.json", fx("followers_1.json"));
  d.file("following.json", fx("following.json"));
  for (const [n, b] of extra || []) d.file(n, b);
  const buf = await z.generateAsync({ type: "nodebuffer" });
  return [new win.File([buf], "export.zip")];
}

beforeEach(async () => {
  confirmed = true;
  boot();
  const { init } = await import("../src/ui.js?t=" + Math.random());
  await init();
});

describe("first upload", () => {
  it("shows the headline number, the stats and the default list", async () => {
    await upload(basicExport());
    expect($("out").hidden).toBe(false);
    expect(text("big")).toBe("1"); // only erin is not following back
    expect(text("sa")).toBe("3"); // followers
    expect(text("sb")).toBe("2"); // following
    expect(text("sc")).toBe("1"); // mutual: alice
    expect(activeTab()).toMatch(/^Not back/);
    expect(rowNames()).toEqual(["@erin"]);
  });

  it("reads a whole ZIP and reveals a tab for each extra list it finds", async () => {
    await upload(
      await zipExport([
        ["pending_follow_requests.json", fx("pending_follow_requests.json")],
        ["blocked_profiles.json", fx("blocked_profiles.json")]
      ])
    );
    expect(text("sa")).toBe("3");
    const tabs = tabNames().join(" ");
    expect(tabs).toMatch(/Pending out \(1\)/);
    expect(tabs).toMatch(/Blocked \(1\)/);
    expect($("msg").textContent).toMatch(/Also read: pending, blocked/);
  });

  it("refuses a partial export and says what it found", async () => {
    await upload([file("followers_1.json", fx("followers_1.json"))]);
    expect($("msg").className).toBe("bad");
    expect($("msg").textContent).toMatch(/Need both followers and following/);
    expect($("msg").textContent).toMatch(/3 followers and 0 following/);
    expect($("out").hidden).toBe(true);
  });

  it("hides the comparison tabs until there is a second snapshot", async () => {
    await upload(basicExport());
    expect(tabNames().join(" ")).not.toMatch(/Unfollowed you|Timeline/);
    expect($("chartbox").hidden).toBe(true);
  });
});

describe("the count mismatch guard", () => {
  it("warns loudly when the export does not match the profile", async () => {
    await upload(basicExport());
    $("claim").value = "900";
    $("claimb").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("mismatch").hidden).toBe(false);
    expect($("mismatch").textContent).toMatch(/MISMATCH/);
    expect($("mismatch").textContent).toMatch(/ALL TIME/);
  });

  it("stays quiet when the counts agree", async () => {
    await upload(basicExport());
    $("claim").value = "3";
    $("claimb").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("mismatch").hidden).toBe(true);
    expect($("msg").textContent).toMatch(/Counts match/);
  });
});

describe("list interaction", () => {
  const click = (el) => el.dispatchEvent(new win.Event("click"));

  it("always-skips an account and moves it to the Always skip tab", async () => {
    await upload(basicExport());
    const skip = Array.from($("list").querySelectorAll("button")).find((b) => b.textContent === "Skip");
    click(skip);
    await tick();
    expect(rowNames()).toEqual([]);
    expect(text("big")).toBe("0");
    const skipTab = Array.from($("tabs").children).find((b) => /^Always skip/.test(b.textContent));
    expect(skipTab.textContent).toMatch(/Always skip \(1\)/);
    click(skipTab);
    expect(rowNames()).toEqual(["@erin"]);
    click(Array.from($("list").querySelectorAll("button")).find((b) => b.textContent === "Unskip"));
    await tick();
    expect(tabNames().join(" ")).not.toMatch(/Always skip/);
  });

  it("snoozes an account until the next upload", async () => {
    await upload(basicExport());
    click(Array.from($("list").querySelectorAll("button")).find((b) => b.textContent === "Snooze"));
    await tick();
    expect(rowNames()).toEqual([]);
    const snoozeTab = Array.from($("tabs").children).find((b) => /^Snoozed/.test(b.textContent));
    expect(snoozeTab.textContent).toMatch(/Snoozed \(1\)/);
  });

  it("marks an account done without dropping it from the list", async () => {
    await upload(basicExport());
    click(Array.from($("list").querySelectorAll("button")).find((b) => b.textContent === "Done"));
    await tick();
    expect($("list").querySelector("li").className).toMatch(/dn/);
    expect(rowNames()).toEqual(["@erin"]);
    expect(Array.from($("list").querySelectorAll("button")).some((b) => b.textContent === "Undo")).toBe(true);
  });

  it("keeps focus inside the list after a row disappears", async () => {
    await upload(basicExport());
    const skip = Array.from($("list").querySelectorAll("button")).find((b) => b.textContent === "Skip");
    skip.focus();
    click(skip);
    await tick();
    expect($("list").contains(doc.activeElement) || doc.activeElement === $("list")).toBe(true);
  });

  it("selects every filtered row and hides them in bulk", async () => {
    await upload(basicExport());
    const fans = Array.from($("tabs").children).find((b) => /^You skip/.test(b.textContent));
    click(fans);
    expect(rowNames().sort()).toEqual(["@bob_the.builder", "@carol"]);
    $("all").checked = true;
    $("all").dispatchEvent(new win.Event("change"));
    expect($("bskip").textContent).toBe("Always skip 2");
    expect($("bskip").disabled).toBe(false);
    click($("bskip"));
    await tick();
    expect(rowNames()).toEqual([]);
    expect($("msg").textContent).toMatch(/Always skipping 2 account/);
  });

  it("filters by search and keeps the bulk buttons disabled until something is picked", async () => {
    await upload(basicExport());
    const fans = Array.from($("tabs").children).find((b) => /^You skip/.test(b.textContent));
    click(fans);
    expect($("bskip").disabled).toBe(true);
    $("q").value = "carol";
    $("q").dispatchEvent(new win.Event("input"));
    await new Promise((r) => setTimeout(r, 200));
    expect(rowNames()).toEqual(["@carol"]);
    expect(text("shown")).toMatch(/Showing 1 of 1/);
  });

  it("moves between tabs with the arrow keys", async () => {
    await upload(basicExport());
    const first = $("tabs").children[0];
    first.focus();
    $("tabs").dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(activeTab()).toMatch(/^You skip/);
  });

  it("gives the tablist proper roles and roving tabindex", async () => {
    await upload(basicExport());
    expect($("tabs").getAttribute("role")).toBe("tablist");
    const bs = Array.from($("tabs").children);
    expect(bs.every((b) => b.getAttribute("role") === "tab")).toBe(true);
    expect(bs.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect($("list").getAttribute("aria-labelledby")).toBe("tab-notback");
  });
});

describe("second upload", () => {
  const second = () => [
    file(
      "followers_1.json",
      JSON.stringify([
        { string_list_data: [{ value: "alice", timestamp: 1700000000 }] },
        { string_list_data: [{ value: "zoe", timestamp: 1700600000 }] }
      ])
    ),
    file("following.json", JSON.stringify({ relationships_following: [{ string_list_data: [{ value: "alice" }] }] }))
  ];

  it("records who left, who arrived, and builds the chart and timeline", async () => {
    await upload(basicExport());
    const d = new Date(Date.now() + 86400000);
    vi.setSystemTime(d);
    await upload(second());
    vi.useRealTimers();

    expect($("chartbox").hidden).toBe(false);
    expect($("chart").innerHTML).toMatch(/polyline/);
    const tabs = tabNames().join(" ");
    expect(tabs).toMatch(/Unfollowed you \(2\)/); // bob_the.builder and carol
    expect(tabs).toMatch(/New followers \(1\)/); // zoe
    expect(tabs).toMatch(/Timeline/);

    const lost = Array.from($("tabs").children).find((b) => /^Unfollowed you/.test(b.textContent));
    lost.dispatchEvent(new win.Event("click"));
    expect(rowNames().sort()).toEqual(["@bob_the.builder", "@carol"]);
    expect($("cmp").hidden).toBe(false);
    expect($("ca").children).toHaveLength(2);

    const tl = Array.from($("tabs").children).find((b) => /^Timeline/.test(b.textContent));
    tl.dispatchEvent(new win.Event("click"));
    expect($("list").textContent).toMatch(/UNFOLLOWED YOU/);
    expect($("list").textContent).toMatch(/GAINED/);
  });

  it("keeps the follow date from the first upload after later ones drop it", async () => {
    await upload(basicExport());
    vi.setSystemTime(new Date(Date.now() + 86400000));
    await upload([
      file("followers_1.json", JSON.stringify([{ string_list_data: [{ value: "alice" }] }])),
      file(
        "following.json",
        JSON.stringify({
          relationships_following: [
            { string_list_data: [{ value: "alice" }] },
            { string_list_data: [{ value: "erin" }] }
          ]
        })
      )
    ]);
    vi.useRealTimers();
    $("so").value = "new";
    $("so").dispatchEvent(new win.Event("change"));
    const mutual = Array.from($("tabs").children).find((b) => /^Mutual/.test(b.textContent));
    mutual.dispatchEvent(new win.Event("click"));
    expect($("list").textContent).toMatch(
      new RegExp(new Date(1699000000 * 1000).toLocaleDateString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  });
});

describe("exports and backup", () => {
  it("builds a quoted CSV of the rows on screen", async () => {
    await upload(basicExport());
    let captured = "";
    win.Blob = class extends globalThis.Blob {
      constructor(parts, opts) {
        super(parts, opts);
        captured = String(parts[0]);
      }
    };
    globalThis.Blob = win.Blob;
    $("dl").dispatchEvent(new win.Event("click"));
    const lines = captured.trim().split("\r\n");
    expect(lines[0]).toBe("username,list,follow_date,done,always_skip,snoozed,profile_url");
    expect(lines[1]).toMatch(/^erin,notback,/);
    expect(lines[1]).toMatch(/https:\/\/www\.instagram\.com\/erin\/$/);
  });

  it("round-trips a backup through the file picker", async () => {
    await upload(basicExport());
    let backup = "";
    win.Blob = class extends globalThis.Blob {
      constructor(parts, opts) {
        super(parts, opts);
        backup = String(parts[0]);
      }
    };
    globalThis.Blob = win.Blob;
    $("bkdl").dispatchEvent(new win.Event("click"));
    expect(JSON.parse(backup).v).toBe(2);

    $("clr").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("out").hidden).toBe(true);

    $("bk").value = backup;
    $("rs").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("out").hidden).toBe(false);
    expect(text("big")).toBe("1");
    expect($("msg").textContent).toMatch(/Backup restored \(1 snapshots\)/);
  });

  it("rejects a bad backup with a reason", async () => {
    await upload(basicExport());
    $("bk").value = "{{{";
    $("rs").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("msg").className).toBe("bad");
    expect($("msg").textContent).toMatch(/not a valid backup \(not JSON\)/);
  });
});

describe("snapshot manager", () => {
  it("lists, labels and deletes snapshots", async () => {
    await upload(basicExport());
    $("mgr").dispatchEvent(new win.Event("click"));
    expect($("mgrbox").hidden).toBe(false);
    expect($("snaps").children).toHaveLength(1);
    expect($("snaps").textContent).toMatch(/3 \/ 2/);

    const input = $("snaps").querySelector("input");
    input.value = "all time";
    input.dispatchEvent(new win.Event("change"));
    $("mgr").dispatchEvent(new win.Event("click"));
    $("mgr").dispatchEvent(new win.Event("click"));
    expect($("snaps").querySelector("input").value).toBe("all time");

    $("snaps").querySelector("button").dispatchEvent(new win.Event("click"));
    await tick();
    expect($("snaps").textContent).toMatch(/No snapshots/);
  });

  it("reports storage use", async () => {
    await upload(basicExport());
    expect(text("usage")).toMatch(/Nothing is saved/);
    expect(text("usage")).toMatch(/1 snapshot\(s\) and 4 accounts/);
  });
});

describe("nothing is kept between visits", () => {
  it("starts over on reload and asks for the ZIP again", async () => {
    await upload(basicExport());
    expect($("out").hidden).toBe(false);

    boot();
    const { init } = await import("../src/ui.js?t=" + Math.random());
    await init();

    expect($("out").hidden).toBe(true);
    expect($("drop")).not.toBeNull();
  });

  it("writes nothing to localStorage", async () => {
    await upload(basicExport());
    $("th").dispatchEvent(new win.Event("click"));
    await tick();
    for (const k of ["fb_db_v2", "fb_snaps_v1", "fb_meta_v1"]) expect(win.localStorage.getItem(k)).toBeNull();
  });

  it("ignores and erases history saved by earlier versions", async () => {
    boot();
    win.localStorage.setItem("fb_db_v2", JSON.stringify({ v: 2, names: ["alice"], snaps: [] }));
    win.localStorage.setItem("fb_snaps_v1", JSON.stringify([{ t: Date.now(), followers: ["alice"], following: [] }]));
    win.localStorage.setItem("fb_meta_v1", JSON.stringify({ ign: [], done: [], th: "", so: "az" }));
    const { init } = await import("../src/ui.js?t=" + Math.random());
    await init();
    await tick();

    expect($("out").hidden).toBe(true);
    for (const k of ["fb_db_v2", "fb_snaps_v1", "fb_meta_v1"]) expect(win.localStorage.getItem(k)).toBeNull();
  });
});

describe("queue mode", () => {
  const click = (el) => el.dispatchEvent(new win.Event("click"));
  const key = (k) => $("list").dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }));

  it("walks the list with the keyboard and opens profiles", async () => {
    await upload(basicExport());
    const fans = Array.from($("tabs").children).find((b) => /^You skip/.test(b.textContent));
    click(fans); // two entries: bob_the.builder, carol
    click($("queue"));
    expect($("queue").getAttribute("aria-pressed")).toBe("true");
    expect($("pace").hidden).toBe(false);
    expect($("pace").textContent).toMatch(/100 to 200 a day/);
    expect($("list").querySelector("li.cur")).toBeTruthy();

    key("j");
    expect($("list").children[1].className).toMatch(/cur/);
    key(" ");
    await tick();
    expect(win.__opened.at(-1)).toMatch(/instagram\.com\/carol/);
    expect($("qprog").textContent).toMatch(/of 2 handled/);
  });

  it("opens the next ten and ticks them off", async () => {
    await upload(basicExport());
    const fans = Array.from($("tabs").children).find((b) => /^You skip/.test(b.textContent));
    click(fans);
    click($("queue"));
    win.__opened = [];
    click($("open10"));
    await tick();
    expect(win.__opened).toHaveLength(2);
    expect($("msg").textContent).toMatch(/Opened 2 profiles/);
  });
});

describe("insights panel", () => {
  const upSecond = async () => {
    vi.setSystemTime(new Date(Date.now() + 40 * 86400000));
    await upload([
      file(
        "followers_1.json",
        JSON.stringify([
          { string_list_data: [{ value: "alice", timestamp: 1700000000 }] },
          { string_list_data: [{ value: "newbie", timestamp: 1700600000 }] }
        ])
      ),
      file("following.json", JSON.stringify({ relationships_following: [{ string_list_data: [{ value: "alice" }] }] }))
    ]);
    vi.useRealTimers();
  };

  it("shows growth and a retention table after a second upload", async () => {
    await upload(basicExport());
    await upSecond();
    $("ins").dispatchEvent(new win.Event("click"));
    expect($("insbox").hidden).toBe(false);
    expect($("insbody").textContent).toMatch(/Net followers/);
    expect($("insbody").textContent).toMatch(/Retention by month/);
    expect($("insbody").querySelector("table")).toBeTruthy();
  });

  it("asks for a second upload when there is only one snapshot", async () => {
    await upload(basicExport());
    $("ins").dispatchEvent(new win.Event("click"));
    expect($("insbody").textContent).toMatch(/second export/);
  });
});

describe("per-account history", () => {
  it("expands a row to show its event history", async () => {
    await upload(basicExport());
    vi.setSystemTime(new Date(Date.now() + 86400000));
    await upload([
      file(
        "followers_1.json",
        JSON.stringify([{ string_list_data: [{ value: "alice" }] }, { string_list_data: [{ value: "carol" }] }])
      ),
      file(
        "following.json",
        JSON.stringify({
          relationships_following: [
            { string_list_data: [{ value: "alice" }] },
            { string_list_data: [{ value: "erin" }] }
          ]
        })
      )
    ]);
    vi.useRealTimers();
    // bob_the.builder unfollowed between the two uploads, so it has an event.
    const lost = Array.from($("tabs").children).find((b) => /^Unfollowed you/.test(b.textContent));
    lost.dispatchEvent(new win.Event("click"));
    const exp = Array.from($("list").querySelectorAll("button")).find((b) => b.getAttribute("aria-expanded") !== null);
    expect(exp).toBeTruthy();
    exp.dispatchEvent(new win.Event("click"));
    expect($("list").querySelector("li.hist")).toBeTruthy();
    expect($("list").querySelector("li.hist").textContent).toMatch(/UNFOLLOWED YOU/);
  });
});
