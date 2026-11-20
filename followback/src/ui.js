import { createStore, DAY } from "./store.js";
import { forgetSaved } from "./db.js";
import { gather } from "./gather.js";
import { t, LANGS, setLang, getLang, pickLang, translatePage } from "./i18n.js";
import { encryptText, decryptText, isEncrypted, canEncrypt } from "./crypt.js";
import { summaryCard } from "./card.js";

/** @param {string} i @returns {any} the element, typed loosely for DOM property access */
const $ = (i) => document.getElementById(i);
const PAGE = 200;
const SHARE_INBOX = "followback-share-inbox"; // must match sw.js

const TABS = [
  ["notback", "Not back"],
  ["fans", "You skip"],
  ["mutual", "Mutual"],
  ["lost", "Unfollowed you"],
  ["gained", "New followers"],
  ["boomerang", "Boomerang"],
  ["timeline", "Timeline"],
  ["pending", "Pending out"],
  ["received", "Requests in"],
  ["unfollowed", "You unfollowed"],
  ["blocked", "Blocked"],
  ["restricted", "Restricted"],
  ["closefriends", "Close friends"],
  ["snooze", "Snoozed"],
  ["ign", "Always skip"]
];
const EV_LABEL = {
  gained: ["GAINED", "up"],
  lost: ["UNFOLLOWED YOU", "dn2"],
  followed: ["YOU FOLLOWED", "up"],
  unfollowed: ["YOU UNFOLLOWED", "dn2"]
};
const DATE_HINT = { notback: "YOU FOLLOWED ", fans: "THEY FOLLOWED " };
const PACE =
  "Instagram rate-limits bulk unfollowing and can temporarily action-block an account that goes too fast. " +
  "Around 100 to 200 a day is a safe pace, spread out rather than in one burst. This page never touches Instagram " +
  "itself - it only opens profiles so you can act, because automating the site would break their terms and risk your account.";

export async function init() {
  // Nothing is kept between visits: data lives in this tab only, so a refresh
  // starts over at the upload screen. Also wipe anything older versions saved.
  forgetSaved().catch(() => {});
  const S = createStore();
  let tab = S.meta().tab || "notback";
  let ca = -1,
    cb = -1,
    limit = PAGE,
    rows = [],
    chartKey = "",
    busy = false;
  const sel = new Set();
  let queue = false,
    cursor = 0,
    expanded = null;

  /* ---------- helpers ---------- */
  function say(text, cls) {
    const m = $("msg");
    m.textContent = text;
    m.className = cls || "";
  }
  const announce = (text) => {
    $("live").textContent = text;
  };
  function progress(on, frac) {
    const p = $("prog");
    p.classList.toggle("on", !!on);
    p.firstElementChild.style.width = Math.round((frac || 0) * 100) + "%";
  }
  function download(nameStr, text, mime) {
    const b = text instanceof Blob ? text : new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = nameStr;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  const csvCell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const dstr = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString() : "");
  const stamp = () => new Date().toISOString().slice(0, 10);
  const pct = (x) => Math.round(x * 100) + "%";

  /* ---------- parsing ---------- */
  function parseFiles(files) {
    const onProg = (p) => progress(true, p.total ? p.done / p.total : 0);
    const main = () => gather(files, globalThis.JSZip, onProg);
    return new Promise((resolve, reject) => {
      let w = null;
      try {
        w = new Worker("worker.js");
      } catch (e) {
        w = null;
      }
      if (!w) {
        main().then(resolve, reject);
        return;
      }
      let done = false;
      const bail = (why) => {
        if (done) return;
        done = true;
        console.warn("worker unavailable, parsing on main thread:", why);
        try {
          w.terminate();
        } catch (e) {}
        main().then(resolve, reject);
      };
      w.onerror = () => bail("worker error");
      w.onmessageerror = () => bail("message error");
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === "progress") {
          onProg(d);
          return;
        }
        if (done) return;
        done = true;
        w.terminate();
        if (d.type === "done") resolve(d.result);
        else reject(Object.assign(new Error(d.message || "parse failed"), { name: d.name }));
      };
      try {
        w.postMessage({ files: files });
      } catch (e) {
        bail(e.message);
      }
    });
  }

  /**
   * Each ZIP is one export; loose JSON/HTML files together make one more.
   * Dropping an older and a newer ZIP at once gives two snapshots to compare.
   * @param {File[]} files
   */
  function groupExports(files) {
    const zips = files.filter((f) => /\.zip$/i.test(f.name)).map((f) => [f]);
    const loose = files.filter((f) => !/\.zip$/i.test(f.name));
    return loose.length ? zips.concat([loose]) : zips;
  }

  /** @param {File[]} [given] files from a share, instead of the file input */
  async function handle(given) {
    const files = given || Array.prototype.slice.call($("f").files);
    if (!files.length || busy) return;
    busy = true;
    say(t("reading", { n: files.length }));
    progress(true, 0);
    try {
      const groups = groupExports(files);
      const good = [];
      let last = null;
      for (let gi = 0; gi < groups.length; gi++) {
        const r = await parseFiles(groups[gi]);
        last = r;
        const p = r.payload;
        if (p.followers.length && p.following.length) good.push(r);
        else
          console.error(
            "incomplete export",
            groups[gi].map((f) => f.name),
            r.counts,
            r.considered
          );
        progress(true, (gi + 1) / groups.length);
      }
      if (!good.length) {
        const p = last ? last.payload : { followers: [], following: [] };
        say(t("needBoth", { fo: p.followers.length, fg: p.following.length }), "bad");
        return;
      }
      // Oldest first, so each snapshot is compared with the one before it.
      good.sort((a, b) => a.exportedAt - b.exportedAt);
      for (const r of good) S.add(Object.assign({}, r.payload, { t: r.exportedAt }));
      ca = cb = -1;
      limit = PAGE;
      sel.clear();
      cursor = 0;
      expanded = null;
      const newest = good[good.length - 1];
      const p = newest.payload;
      let msg;
      if (good.length > 1) {
        const day = (ms) => new Date(ms).toLocaleDateString();
        msg = t("compared", { n: good.length, a: day(good[0].exportedAt), b: day(newest.exportedAt) });
        tab = "lost";
      } else {
        const extras = Object.keys(p).filter((k) => !["followers", "following"].includes(k) && p[k].length);
        msg =
          t("loaded", { fo: p.followers.length, fg: p.following.length, n: S.snaps().length }) +
          (extras.length ? " Also read: " + extras.join(", ") + "." : "");
      }
      const noDates = good.some((r) => r.warnings && r.warnings.htmlNoDates);
      if (noDates) {
        msg +=
          " No follow dates could be read from this HTML export, so date sorting will be empty - " +
          "request the download again with format set to JSON.";
      }
      if (good.length < groups.length) msg += " " + (groups.length - good.length) + " file(s) were not a full export.";
      say(msg, noDates ? "bad" : "good");
      render(true);
      $("out").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (e) {
      console.error("parse failed", e);
      say(t("cantRead", { e: (e.name || "error") + ": " + (e.message || "unknown") }), "bad");
    } finally {
      busy = false;
      progress(false, 0);
      $("f").value = "";
    }
  }

  /* ---------- rows ---------- */
  function buildRows(L) {
    if (tab === "timeline") return S.events().map((e) => ({ id: e.id, t: e.t, ev: e.k }));
    return (L[tab] || []).map((i) => ({ id: i, t: S.firstSeen(i) }));
  }
  function filterSort(list) {
    const q = $("q").value.trim().toLowerCase();
    const out = q ? list.filter((r) => S.name(r.id).toLowerCase().indexOf(q) > -1) : list.slice();
    const so = S.meta().so;
    if (tab === "timeline") out.sort((a, b) => (so === "old" ? a.t - b.t : b.t - a.t));
    else if (so === "az")
      out.sort((a, b) => S.name(a.id).localeCompare(S.name(b.id), undefined, { sensitivity: "base" }));
    else out.sort((a, b) => (so === "new" ? b.t - a.t : a.t - b.t));
    return out;
  }
  const refreshRows = () => {
    rows = filterSort(buildRows(S.lists(ca, cb)));
  };

  /* ---------- rendering ---------- */
  function render(snapsChanged) {
    if (!S.snaps().length) {
      $("out").hidden = true;
      return;
    }
    $("out").hidden = false;
    const s = S.latest();
    const L = S.lists(ca, cb);

    $("big").textContent = String(L.notback.length);
    $("sa").textContent = String(s.fo.length);
    $("sb").textContent = String(s.fg.length);
    $("sc").textContent = String(L.mutual.length);

    renderDelta(s);
    renderMismatch(s);
    renderTabs(L);
    const cm = $("cmp");
    cm.hidden = !(S.snaps().length > 1 && (tab === "lost" || tab === "gained"));
    if (!cm.hidden) fillCmp();

    refreshRows();
    renderList();
    renderQueue(L);

    const key = S.snaps().length + "|" + s.t + "|" + S.version;
    if (snapsChanged || key !== chartKey) {
      chartKey = key;
      chart();
    }
    if (!$("mgrbox").hidden) renderSnaps();
    if (!$("insbox").hidden) renderInsights();
    renderUsage();
  }

  function renderDelta(s) {
    const days = Math.floor((Date.now() - s.t) / DAY);
    const prev = S.snaps()[S.snaps().length - 2];
    const parts = [days ? t("deltaAgo", { n: days }) : t("deltaToday")];
    if (prev) {
      const A = new Set(prev.fo),
        B = new Set(s.fo);
      let g = 0,
        x = 0;
      for (const i of B) if (!A.has(i)) g++;
      for (const i of A) if (!B.has(i)) x++;
      parts.push(t("deltaSince", { g, l: x, d: new Date(prev.t).toLocaleDateString() }));
    }
    if (days >= 14) parts.push(t("deltaStale"));
    const d = $("delta");
    d.textContent = parts.join(" | ");
    d.classList.toggle("stale", days >= 14);
  }

  /**
   * The commonest cause of wrong results is a date range other than All time,
   * which silently truncates the export. Compare against what the profile says.
   */
  function renderMismatch(s) {
    const claimed = S.meta().claimed;
    const box = $("mismatch");
    if ($("claim").value === "" && claimed != null) $("claim").value = String(claimed);
    if (claimed == null || !claimed) {
      box.hidden = true;
      return;
    }
    const got = s.fo.length;
    const diff = got - claimed;
    if (Math.abs(diff) / claimed <= 0.02) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.textContent =
      "MISMATCH: this export has " +
      got +
      " followers but your profile says " +
      claimed +
      " (" +
      (diff > 0 ? "+" : "") +
      diff +
      "). Request a new download with date range set to ALL TIME, " +
      "format JSON, and upload that instead. These numbers are wrong until they match.";
  }

  function renderTabs(L) {
    const n = S.snaps().length;
    const vis = TABS.filter(([k]) => {
      if (k === "lost" || k === "gained") return n > 1;
      if (k === "timeline") return S.events().length > 0;
      if (k === "notback" || k === "fans" || k === "mutual") return true;
      return (L[k] || []).length > 0;
    });
    if (!vis.some(([k]) => k === tab)) {
      tab = "notback";
      sel.clear();
      limit = PAGE;
      cursor = 0;
    }
    const tb = $("tabs");
    tb.textContent = "";
    for (const [k] of vis) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "tab-" + k;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tab === k));
      b.setAttribute("aria-controls", "list");
      b.tabIndex = tab === k ? 0 : -1;
      b.textContent = t("tab_" + k) + " (" + (k === "timeline" ? S.events().length : (L[k] || []).length) + ")";
      b.onclick = () => {
        if (tab === k) return;
        tab = k;
        S.meta().tab = k;
        sel.clear();
        limit = PAGE;
        cursor = 0;
        expanded = null;
        render();
      };
      tb.appendChild(b);
    }
    $("list").setAttribute("aria-labelledby", "tab-" + tab);
    $("bskip").hidden = tab === "timeline" || tab === "ign";
    $("bsnooze").hidden = tab === "timeline" || tab === "snooze";
    $("bdone").hidden = tab === "timeline";
    $("alll").hidden = tab === "timeline";
  }

  function row(r, index) {
    const u = S.name(r.id);
    const li = document.createElement("li");
    li.className = "r" + (queue && index === cursor ? " cur" : "");
    li.dataset.id = String(r.id);
    const a = document.createElement("a");
    a.href = "https://www.instagram.com/" + encodeURIComponent(u) + "/";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    if (tab === "timeline") {
      a.className = "ev";
      const lab = EV_LABEL[r.ev] || [String(r.ev).toUpperCase(), "up"];
      const b = document.createElement("b");
      b.className = lab[1];
      b.textContent = lab[0] + " ";
      a.appendChild(b);
      a.appendChild(document.createTextNode("@" + u));
      const sp = document.createElement("span");
      sp.className = "d";
      sp.textContent = new Date(r.t).toLocaleDateString();
      a.appendChild(sp);
      li.appendChild(a);
      return li;
    }

    const done = S.meta().done.indexOf(r.id) > -1;
    if (done) li.classList.add("dn");
    const lab = document.createElement("label");
    const cbx = document.createElement("input");
    cbx.type = "checkbox";
    cbx.checked = sel.has(r.id);
    cbx.setAttribute("aria-label", "Select " + u);
    cbx.onchange = () => {
      cbx.checked ? sel.add(r.id) : sel.delete(r.id);
      syncBulk();
    };
    lab.appendChild(cbx);
    li.appendChild(lab);

    a.textContent = "@" + u;
    if (r.t) {
      const sp = document.createElement("span");
      sp.className = "d";
      sp.textContent = (DATE_HINT[tab] || "") + dstr(r.t);
      a.appendChild(sp);
    }
    li.appendChild(a);

    const mk = (text, title, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.dataset.act = text;
      if (title) b.title = title;
      b.onclick = () => fn();
      li.appendChild(b);
      return b;
    };

    if (S.historyOf(r.id).length) {
      const ex = mk(expanded === r.id ? "⌃" : "⌄", "Show this account's history", () => {
        expanded = expanded === r.id ? null : r.id;
        renderList();
      });
      ex.classList.add("exp");
      ex.setAttribute("aria-expanded", String(expanded === r.id));
    }
    if (tab === "ign")
      mk("Unskip", "Show this account again", () => {
        setHide("ign", [r.id], false);
      });
    else if (tab === "snooze")
      mk("Unsnooze", "Show this account again", () => {
        setHide("snooze", [r.id], false);
      });
    else {
      mk(done ? "Undo" : "Done", "Tick off as handled", async () => {
        S.toggle("done", r.id);
        patch(li, r, index);
      });
      mk("Snooze", "Hide until the next upload", () => {
        setHide("snooze", [r.id], true);
      });
      mk("Skip", "Always skip this account", () => {
        setHide("ign", [r.id], true);
      });
    }
    return li;
  }

  /** Expanded per-account event history. */
  function historyRow(idNum) {
    const li = document.createElement("li");
    li.className = "hist";
    const ol = document.createElement("ol");
    for (const e of S.historyOf(idNum)) {
      const item = document.createElement("li");
      const lab = EV_LABEL[e.k] || [e.k, "up"];
      const b = document.createElement("b");
      b.className = lab[1];
      b.textContent = lab[0];
      item.append(b, document.createTextNode(" " + new Date(e.t).toLocaleDateString()));
      ol.appendChild(item);
    }
    const seen = S.firstSeen(idNum);
    if (seen) {
      const item = document.createElement("li");
      item.textContent = "First seen in an export: " + dstr(seen);
      ol.appendChild(item);
    }
    li.appendChild(ol);
    return li;
  }

  /** Replace one row in place, so focus and scroll position survive. */
  function patch(li, r, index) {
    const next = row(r, index);
    const ae = /** @type {any} */ (document.activeElement);
    const act = ae && ae.dataset ? ae.dataset.act : null;
    li.replaceWith(next);
    if (act) {
      const b = /** @type {HTMLElement} */ (
        next.querySelector('button[data-act="' + act + '"]') || next.querySelector("button")
      );
      if (b) b.focus();
    }
  }

  /** A hide action removes the row, so move focus to its neighbour. */
  async function setHide(bucket, ids, on) {
    const ul = $("list");
    const items = Array.prototype.slice.call(ul.children);
    const at = items.findIndex((el) => el.dataset && el.dataset.id === String(ids[0]));
    for (const i of ids) sel.delete(i);
    S.setFlag(bucket, ids, on);
    render();
    const after = Array.prototype.slice.call(ul.children);
    const target = after[Math.min(Math.max(at, 0), after.length - 1)];
    if (!target) {
      ul.focus();
      return;
    }
    const b = target.querySelector("button") || target.querySelector("a");
    (b || ul).focus();
  }

  function renderList() {
    const ul = $("list");
    ul.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "e";
      li.textContent = $("q").value.trim()
        ? "NO MATCH."
        : tab === "lost" || tab === "gained"
          ? "NOBODY SINCE LAST UPLOAD."
          : "NOBODY HERE.";
      ul.appendChild(li);
    } else {
      if (cursor >= rows.length) cursor = rows.length - 1;
      if (cursor < 0) cursor = 0;
      const frag = document.createDocumentFragment();
      rows.slice(0, limit).forEach((r, i) => {
        frag.appendChild(row(r, i));
        if (expanded === r.id && tab !== "timeline") frag.appendChild(historyRow(r.id));
      });
      ul.appendChild(frag);
    }
    const hidden = Math.max(0, rows.length - limit);
    $("more").hidden = hidden === 0;
    $("more").textContent = "Show " + Math.min(PAGE, hidden) + " more";
    $("shown").textContent = rows.length ? "Showing " + Math.min(limit, rows.length) + " of " + rows.length : "";
    $("all").checked = rows.length > 0 && rows.every((r) => sel.has(r.id));
    syncBulk();
  }

  function syncBulk() {
    const n = sel.size;
    for (const [btn, base] of [
      ["bskip", "Always skip"],
      ["bsnooze", "Snooze"],
      ["bdone", "Done"]
    ]) {
      const el = $(btn);
      el.disabled = n === 0;
      el.textContent = n ? base + " " + n : base;
    }
    if (tab === "ign") {
      $("bskip").hidden = false;
      $("bskip").textContent = n ? "Unskip " + n : "Unskip";
    }
    if (tab === "snooze") {
      $("bsnooze").hidden = false;
      $("bsnooze").textContent = n ? "Unsnooze " + n : "Unsnooze";
    }
  }

  /* ---------- queue mode ---------- */
  function renderQueue(L) {
    const on = queue && tab !== "timeline";
    $("queue").setAttribute("aria-pressed", String(on));
    $("open10").hidden = !on;
    $("pace").hidden = !on;
    if (on && !$("pace").textContent) $("pace").textContent = PACE;
    const total = (L[tab] || []).length;
    const handled = (L[tab] || []).filter((i) => S.meta().done.includes(i)).length;
    $("qprog").textContent = on
      ? handled + " of " + total + " handled. j/k to move, space to open and tick, s to snooze, a to always skip."
      : "";
  }

  function moveCursor(delta) {
    if (!rows.length) return;
    cursor = Math.min(rows.length - 1, Math.max(0, cursor + delta));
    if (cursor >= limit) {
      limit = Math.ceil((cursor + 1) / PAGE) * PAGE;
    }
    renderList();
    const el = $("list").children[cursor];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      announce("@" + S.name(rows[cursor].id) + ", " + (cursor + 1) + " of " + rows.length);
    }
  }

  function openProfile(u) {
    const w = window.open("https://www.instagram.com/" + encodeURIComponent(u) + "/", "_blank", "noopener,noreferrer");
    return !!w;
  }

  async function handleCurrent() {
    const r = rows[cursor];
    if (!r) return;
    const u = S.name(r.id);
    const opened = openProfile(u);
    if (!S.meta().done.includes(r.id)) S.toggle("done", r.id);
    announce("@" + u + (opened ? " opened and ticked off." : " ticked off, but the pop-up was blocked."));
    if (!opened) say("Your browser blocked the pop-up. Allow pop-ups for this page to use queue mode.", "bad");
    refreshRows();
    render();
    moveCursor(1);
  }

  async function openNext(n) {
    const todo = rows.filter((r) => !S.meta().done.includes(r.id)).slice(0, n);
    if (!todo.length) {
      say("Nothing left to handle in this list.", "good");
      return;
    }
    let blocked = 0;
    for (const r of todo) if (!openProfile(S.name(r.id))) blocked++;
    S.setFlag(
      "done",
      todo.map((r) => r.id),
      true
    );
    render();
    if (blocked)
      say(
        "Opened " +
          (todo.length - blocked) +
          " of " +
          todo.length +
          " - the rest were blocked by your pop-up blocker. Allow pop-ups for this page.",
        "bad"
      );
    else
      say(
        "Opened " + todo.length + " profiles and ticked them off. Pace yourself: 100 to 200 unfollows a day.",
        "good"
      );
  }

  /* ---------- insights ---------- */
  function renderInsights() {
    const body = $("insbody");
    body.textContent = "";
    const d = S.insights();
    if (!d.intervals.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Upload a second export to unlock growth, churn and retention figures.";
      body.appendChild(p);
      return;
    }
    const dl = document.createElement("dl");
    const stat = (label, value, sub) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (sub) {
        const sm = document.createElement("small");
        sm.textContent = " " + sub;
        dd.appendChild(sm);
      }
      wrap.append(dt, dd);
      dl.appendChild(wrap);
    };
    const sign = (n) => (n > 0 ? "+" : "") + n;
    stat("Tracked for", d.followerDays + " days", "over " + S.snaps().length + " snapshots");
    stat("Net followers", sign(d.growth.total), sign(Math.round(d.growth.perMonth)) + "/month");
    stat("Unfollowed you", String(d.churn.lost), pct(d.churn.share) + " of the first snapshot");
    stat("Churn rate", Math.round(d.churn.ratePerMonth) + "/month", "gained " + d.churn.gained);
    if (d.medianDaysToUnfollow != null)
      stat("Median boomerang", d.medianDaysToUnfollow + " days", "follow to unfollow");
    if (d.best) stat("Best period", sign(d.best.net), new Date(d.best.to).toLocaleDateString());
    if (d.worst && d.worst !== d.best)
      stat("Worst period", sign(d.worst.net), new Date(d.worst.to).toLocaleDateString());
    body.appendChild(dl);

    if (d.cohorts.length) {
      const h = document.createElement("h2");
      h.textContent = "Retention by month joined";
      h.style.marginTop = "18px";
      body.appendChild(h);
      const table = document.createElement("table");
      table.innerHTML = "";
      const thead = document.createElement("tr");
      for (const label of ["Month", "Gained", "Still here", "Retention", ""]) {
        const th = document.createElement("th");
        th.textContent = label;
        thead.appendChild(th);
      }
      table.appendChild(thead);
      for (const c of d.cohorts) {
        const tr = document.createElement("tr");
        for (const v of [c.month, String(c.gained), String(c.stillHere), pct(c.retention)]) {
          const td = document.createElement("td");
          td.textContent = v;
          tr.appendChild(td);
        }
        const td = document.createElement("td");
        const bar = document.createElement("span");
        bar.className = "bar";
        bar.style.width = Math.round(c.retention * 100) + "%";
        td.appendChild(bar);
        tr.appendChild(td);
        table.appendChild(tr);
      }
      body.appendChild(table);
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent =
        "Retention counts the followers first seen in that month who are still following you in the newest snapshot.";
      body.appendChild(note);
    }
  }

  function fillCmp() {
    const sn = S.snaps();
    const specs = /** @type {[string, number, string][]} */ ([
      ["ca", ca < 0 ? sn.length - 2 : ca, "FROM "],
      ["cb", cb < 0 ? sn.length - 1 : cb, "TO "]
    ]);
    for (const [el, val, pre] of specs) {
      const e = $(el);
      e.textContent = "";
      sn.forEach((s, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = pre + new Date(s.t).toLocaleDateString() + (s.label ? " - " + s.label : "");
        e.appendChild(o);
      });
      e.value = String(val);
    }
  }

  function renderSnaps() {
    const ul = $("snaps");
    ul.textContent = "";
    S.snaps().forEach((s, i) => {
      const li = document.createElement("li");
      const sp = document.createElement("span");
      sp.textContent = new Date(s.t).toLocaleDateString() + " - " + s.fo.length + " / " + s.fg.length;
      const inp = document.createElement("input");
      inp.value = s.label || "";
      inp.placeholder = "LABEL";
      inp.setAttribute("aria-label", "Label for snapshot " + (i + 1));
      inp.onchange = async () => {
        S.label(i, inp.value);
        fillCmp();
      };
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "DELETE";
      del.onclick = async () => {
        if (!confirm("Delete the snapshot from " + new Date(s.t).toLocaleDateString() + "?")) return;
        S.deleteSnapshot(i);
        ca = cb = -1;
        render(true);
        renderSnaps();
      };
      li.append(sp, inp, del);
      ul.appendChild(li);
    });
    if (!S.snaps().length) {
      const li = document.createElement("li");
      li.textContent = "No snapshots.";
      ul.appendChild(li);
    }
  }

  function renderUsage() {
    $("usage").textContent = t("usage", { n: S.snaps().length, a: S.raw.names.length });
  }

  /** Read a theme colour, for drawing where CSS variables do not reach. */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------- chart ---------- */
  /**
   * x is proportional to real elapsed time. Spacing points evenly by index made
   * a one-day gap and a two-month gap look identical, which misread as steady
   * growth.
   */
  function chart() {
    const sn = S.snaps();
    const box = $("chartbox");
    if (sn.length < 2) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    const W = 640,
      H = 280,
      L = 46,
      R = 14,
      T = 16,
      B = 44;
    const t0 = sn[0].t,
      t1 = sn[sn.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const series = [
      { key: "followers", label: "Followers", color: cssVar("--hot", "#a8533b"), dash: "0", at: (s) => s.fo.length },
      { key: "following", label: "Following", color: "currentColor", dash: "12 8", at: (s) => s.fg.length },
      { key: "notback", label: "Not following back", color: "currentColor", dash: "3 6", at: (s) => S.notBackCount(s) }
    ];
    let max = 0,
      min = Infinity;
    for (const s of sn)
      for (const ser of series) {
        const v = ser.at(s);
        max = Math.max(max, v);
        min = Math.min(min, v);
      }
    if (max === min) {
      max += 1;
      min = Math.max(0, min - 1);
    }
    const X = (t) => L + ((W - L - R) * (t - t0)) / span;
    const Y = (v) => H - B - ((H - T - B) * (v - min)) / (max - min);

    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let h = "";
    // axes
    h +=
      '<line x1="' +
      L +
      '" y1="' +
      (H - B) +
      '" x2="' +
      (W - R) +
      '" y2="' +
      (H - B) +
      '" stroke="currentColor" stroke-width="4"/>';
    h +=
      '<line x1="' +
      L +
      '" y1="' +
      T +
      '" x2="' +
      L +
      '" y2="' +
      (H - B) +
      '" stroke="currentColor" stroke-width="4"/>';

    // dated ticks, thinned to at most six labels
    const step = Math.max(1, Math.ceil(sn.length / 6));
    sn.forEach((s, i) => {
      if (i % step !== 0 && i !== sn.length - 1) return;
      const x = X(s.t);
      h +=
        '<line x1="' +
        x +
        '" y1="' +
        (H - B) +
        '" x2="' +
        x +
        '" y2="' +
        (H - B + 7) +
        '" stroke="currentColor" stroke-width="3"/>';
      h +=
        '<text x="' +
        x +
        '" y="' +
        (H - B + 24) +
        '" font-size="13" font-family="monospace" fill="currentColor" text-anchor="middle">' +
        esc(new Date(s.t).toLocaleDateString(undefined, { day: "numeric", month: "short" })) +
        "</text>";
    });

    for (const ser of series) {
      h +=
        '<polyline points="' +
        sn.map((s) => X(s.t) + "," + Y(ser.at(s))).join(" ") +
        '" fill="none" stroke="' +
        ser.color +
        '" stroke-width="5" stroke-dasharray="' +
        ser.dash +
        '"/>';
      for (const s of sn) {
        const v = ser.at(s);
        h +=
          '<rect x="' +
          (X(s.t) - 6) +
          '" y="' +
          (Y(v) - 6) +
          '" width="12" height="12" fill="' +
          ser.color +
          '" stroke="currentColor" stroke-width="2"><title>' +
          esc(ser.label + ": " + v + " on " + new Date(s.t).toLocaleDateString()) +
          "</title></rect>";
      }
    }
    h +=
      '<text x="4" y="' + (T + 10) + '" font-size="13" font-family="monospace" fill="currentColor">' + max + "</text>";
    h +=
      '<text x="4" y="' + (H - B) + '" font-size="13" font-family="monospace" fill="currentColor">' + min + "</text>";

    const svg = $("chart");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.style.color = getComputedStyle(document.body).color;
    svg.innerHTML = h;
    const days = Math.round(span / DAY);
    $("legend").textContent =
      "Solid orange = followers. Long dashes = following. Short dashes = not following you back. " +
      sn.length +
      " snapshots over " +
      days +
      " days, " +
      new Date(t0).toLocaleDateString() +
      " to " +
      new Date(t1).toLocaleDateString() +
      ". The x-axis is to scale, so gaps between uploads show as gaps. Hover a marker for exact values.";
  }

  /* ---------- export ---------- */
  function csv() {
    const head =
      tab === "timeline"
        ? ["event", "username", "date", "profile_url"]
        : ["username", "list", "follow_date", "done", "always_skip", "snoozed", "profile_url"];
    const lines = [head.join(",")];
    for (const r of rows) {
      const u = S.name(r.id);
      const url = "https://www.instagram.com/" + u + "/";
      const cells =
        tab === "timeline"
          ? [(EV_LABEL[r.ev] || [r.ev])[0], u, new Date(r.t).toISOString().slice(0, 10), url]
          : [
              u,
              tab,
              dstr(r.t),
              S.meta().done.includes(r.id) ? "yes" : "",
              S.meta().ign.includes(r.id) ? "yes" : "",
              S.meta().snooze.includes(r.id) ? "yes" : "",
              url
            ];
      lines.push(cells.map(csvCell).join(","));
    }
    return lines.join("\r\n");
  }

  /* ---------- wiring ---------- */
  function applyTheme() {
    const t = S.meta().th;
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }

  $("f").addEventListener("change", () => handle());
  const dz = $("drop");
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("over");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("over");
    if (e.dataTransfer.files.length) {
      $("f").files = e.dataTransfer.files;
      handle();
    }
  });

  /** @type {any} */
  let qt = 0;
  $("q").addEventListener("input", () => {
    clearTimeout(qt);
    qt = setTimeout(() => {
      limit = PAGE;
      cursor = 0;
      refreshRows();
      renderList();
      announce(rows.length + " matching accounts.");
    }, 150);
  });
  $("so").addEventListener("change", function () {
    S.meta().so = this.value;
    limit = PAGE;
    render();
  });
  $("more").onclick = () => {
    limit += PAGE;
    renderList();
  };
  $("all").onchange = function () {
    if (this.checked) for (const r of rows) sel.add(r.id);
    else for (const r of rows) sel.delete(r.id);
    renderList();
    announce(sel.size + " selected.");
  };
  $("bskip").onclick = () => {
    const ids = Array.from(sel);
    setHide("ign", ids, tab !== "ign");
    say((tab === "ign" ? "Unskipped " : "Always skipping ") + ids.length + " account(s).", "good");
  };
  $("bsnooze").onclick = () => {
    const ids = Array.from(sel);
    setHide("snooze", ids, tab !== "snooze");
    say((tab === "snooze" ? "Unsnoozed " : "Snoozed ") + ids.length + " account(s) until your next upload.", "good");
  };
  $("bdone").onclick = async () => {
    const ids = Array.from(sel);
    S.setFlag("done", ids, true);
    sel.clear();
    render();
    announce("Ticked off " + ids.length + " accounts.");
  };
  $("tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const bs = Array.prototype.slice.call(e.currentTarget.children);
    const at = bs.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const next = bs[(at + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length];
    next.focus();
    next.click();
  });
  $("ca").onchange = function () {
    ca = +this.value;
    limit = PAGE;
    render();
  };
  $("cb").onchange = function () {
    cb = +this.value;
    limit = PAGE;
    render();
  };

  $("queue").onclick = () => {
    queue = !queue;
    cursor = 0;
    render();
    if (queue) {
      $("list").focus();
      announce("Queue mode on. " + rows.length + " accounts. j and k to move, space to open and tick off.");
    } else announce("Queue mode off.");
  };
  $("open10").onclick = () => openNext(10);
  $("list").addEventListener("keydown", (e) => {
    if (!queue || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "j" || k === "ArrowDown") {
      e.preventDefault();
      moveCursor(1);
    } else if (k === "k" || k === "ArrowUp") {
      e.preventDefault();
      moveCursor(-1);
    } else if (k === " " || k === "Enter") {
      e.preventDefault();
      handleCurrent();
    } else if (k === "s") {
      e.preventDefault();
      const r = rows[cursor];
      if (r) setHide("snooze", [r.id], true);
    } else if (k === "a") {
      e.preventDefault();
      const r = rows[cursor];
      if (r) setHide("ign", [r.id], true);
    } else if (k === "Escape") {
      e.preventDefault();
      queue = false;
      render();
      announce("Queue mode off.");
    }
  });

  $("cp").onclick = function () {
    const text = csv();
    const btn = this;
    const ok = () => {
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(ok, () => say("Clipboard blocked. Use the CSV button instead.", "bad"));
    else say("Clipboard unavailable. Use the CSV button instead.", "bad");
  };
  $("dl").onclick = () => download("followback-" + tab + "-" + stamp() + ".csv", csv(), "text/csv;charset=utf-8");
  $("bkdl").onclick = async () => {
    const pw = $("bkpw").value;
    if (pw && !canEncrypt()) {
      say(t("noCrypto"), "bad");
      return;
    }
    const body = pw ? await encryptText(S.exportJson(), pw) : S.exportJson();
    download("followback-backup-" + stamp() + (pw ? ".locked" : "") + ".json", body, "application/json");
    say(t(pw ? "bkEnc" : "bkPlain"), pw ? "good" : "bad");
  };
  $("bkf").addEventListener("change", async function () {
    const f = this.files && this.files[0];
    if (!f) return;
    await restore(await f.text());
    this.value = "";
  });
  $("rs").onclick = () => restore($("bk").value);
  async function restore(text) {
    if (isEncrypted(text)) {
      const pw = $("bkpw").value;
      if (!pw) {
        say(t("needPw"), "bad");
        $("bkpw").focus();
        return;
      }
      if (!canEncrypt()) {
        say(t("noCrypto"), "bad");
        return;
      }
      const d = await decryptText(text, pw);
      if (!d.ok) {
        say(t("wrongPw"), "bad");
        return;
      }
      text = d.text;
    }
    const r = S.importJson(text);
    if (!r.ok) {
      say(t("invalid", { r: r.reason }), "bad");
      return;
    }
    ca = cb = -1;
    limit = PAGE;
    sel.clear();
    cursor = 0;
    expanded = null;
    applyTheme();
    $("so").value = S.meta().so;
    $("claim").value = S.meta().claimed == null ? "" : String(S.meta().claimed);
    say(t("restored", { n: r.count }), "good");
    render(true);
  }
  $("clr").onclick = async () => {
    if (!confirm(t("confirmClear"))) return;
    S.clear();
    $("bk").value = "";
    $("out").hidden = true;
    say(t("cleared"), "good");
  };
  $("claimb").onclick = async () => {
    const v = $("claim").value.trim();
    S.meta().claimed = v === "" ? null : Math.max(0, Math.floor(Number(v)));
    render();
    if ($("mismatch").hidden && S.meta().claimed) say("Counts match. Your export is complete.", "good");
  };
  $("claim").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("claimb").click();
    }
  });
  $("mgr").onclick = () => {
    const box = $("mgrbox");
    box.hidden = !box.hidden;
    if (!box.hidden) {
      renderSnaps();
      box.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };
  $("ins").onclick = () => {
    const box = $("insbox");
    box.hidden = !box.hidden;
    if (!box.hidden) {
      renderInsights();
      box.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };
  $("th").onclick = async () => {
    const dark = S.meta().th ? S.meta().th === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    S.meta().th = dark ? "light" : "dark";
    applyTheme();
    chart();
  };

  $("img").onclick = () => {
    const prev = S.snaps()[S.snaps().length - 2] || null;
    const L = S.lists();
    const s0 = S.latest();
    const canvas = summaryCard(document, {
      notBack: L.notback.length,
      followers: s0.fo.length,
      following: s0.fg.length,
      mutual: L.mutual.length,
      since: prev ? { d: new Date(prev.t).toLocaleDateString(), g: L.gained.length, l: L.lost.length } : null,
      date: new Date(s0.t).toLocaleDateString(),
      colors: {
        bg: cssVar("--bg", "#f4efe6"),
        panel: cssVar("--panel", "#fffaf2"),
        ink: cssVar("--ink", "#2f3437"),
        hot: cssVar("--hot", "#a8533b"),
        soft: cssVar("--muted", "#7b7f82")
      },
      t
    });
    if (!canvas || !canvas.toBlob) {
      say(t("noCanvas"), "bad");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        say(t("noCanvas"), "bad");
        return;
      }
      download("followback-summary-" + stamp() + ".png", blob, "image/png");
      say(t("imgSaved"), "good");
    }, "image/png");
  };

  // Everything is lost on refresh, so ask first once there is something to lose.
  window.addEventListener("beforeunload", (e) => {
    if (!S.snaps().length) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---------- language ---------- */
  setLang(pickLang(location.search, navigator.languages || [navigator.language]));
  const langSel = $("lang");
  for (const [code, label] of LANGS) {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = label;
    langSel.appendChild(o);
  }
  langSel.value = getLang();
  langSel.onchange = () => {
    setLang(langSel.value);
    // Kept in the address, not browser storage, so a refresh keeps it.
    try {
      const u = new URL(location.href);
      if (getLang() === "en") u.searchParams.delete("lang");
      else u.searchParams.set("lang", getLang());
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (err) {
      /* file:// or a sandbox without history: the switch still applies */
    }
    translatePage(document);
    render();
  };
  translatePage(document);

  applyTheme();
  $("so").value = S.meta().so;
  if (S.meta().claimed != null) $("claim").value = String(S.meta().claimed);
  render(true);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker not registered", e));
  }
  await openShared();
  return S;

  /**
   * A ZIP shared to the installed app (Android's share sheet) arrives at the
   * service worker, which parks it in a cache for this page to pick up. It is
   * read once and deleted straight away, so nothing is kept.
   */
  async function openShared() {
    if (!/[?&]share=1/.test(location.search) || typeof caches === "undefined") return;
    try {
      const u = new URL(location.href);
      u.searchParams.delete("share");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (err) {
      /* keep going */
    }
    try {
      const c = await caches.open(SHARE_INBOX);
      const keys = await c.keys();
      const files = [];
      for (const k of keys) {
        const res = await c.match(k);
        if (!res) continue;
        const name = decodeURIComponent(res.headers.get("x-name") || "shared.zip");
        files.push(
          new File([await res.blob()], name, { lastModified: Number(res.headers.get("x-modified")) || Date.now() })
        );
      }
      await caches.delete(SHARE_INBOX);
      if (files.length) {
        await handle(files);
        if ($("msg").className === "good") say(t("shared") + " " + $("msg").textContent, "good");
      }
    } catch (err) {
      console.warn("could not open the shared file", err);
    }
  }
}

if (typeof document !== "undefined") {
  const boot = () => {
    init().catch((e) => console.error("failed to start", e));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
