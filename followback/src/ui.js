import { createStore } from "./store.js";
import { gather } from "./gather.js";

const $ = (i) => document.getElementById(i);
const PAGE = 200;
const QUOTA_EST = 5 * 1024 * 1024;

const TABS = [
  ["notback", "Not back"], ["fans", "You skip"], ["mutual", "Mutual"],
  ["lost", "Unfollowed you"], ["gained", "New followers"], ["boomerang", "Boomerang"],
  ["timeline", "Timeline"], ["pending", "Pending out"], ["received", "Requests in"],
  ["unfollowed", "You unfollowed"], ["blocked", "Blocked"], ["restricted", "Restricted"],
  ["closefriends", "Close friends"], ["ign", "Hidden"]
];
const EV_LABEL = { gained: ["GAINED", "up"], lost: ["UNFOLLOWED YOU", "dn2"], followed: ["YOU FOLLOWED", "up"], unfollowed: ["YOU UNFOLLOWED", "dn2"] };
const DATE_HINT = { notback: "YOU FOLLOWED ", fans: "THEY FOLLOWED " };

export function init() {
  const S = createStore();
  const migration = S.load();
  let tab = S.meta().tab || "notback";
  let ca = -1, cb = -1, limit = PAGE, rows = [], sel = new Set(), chartKey = "", busy = false;

  /* ---------- helpers ---------- */
  function say(text, cls) {
    const m = $("msg");
    m.textContent = text;
    m.className = cls || "";
  }
  function progress(on, frac) {
    const p = $("prog");
    p.classList.toggle("on", !!on);
    p.firstElementChild.style.width = Math.round((frac || 0) * 100) + "%";
  }
  function download(nameStr, text, mime) {
    const b = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = nameStr;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  const csvCell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const dstr = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString() : "");
  const stamp = () => new Date().toISOString().slice(0, 10);

  /** Persist, and offer to prune when the browser quota is full. */
  function persist(r) {
    if (r && r.ok === false && r.quota) {
      const n = Math.min(5, Math.max(1, S.snaps().length - 1));
      if (confirm("This browser's storage is full. Delete the " + n + " oldest snapshot(s) and retry?")) {
        const p = S.pruneOldest(n);
        if (p.ok) { say("Storage was full. Dropped " + p.dropped + " old snapshot(s).", "bad"); return true; }
      }
      say("Could not save: this browser's storage is full. Download a backup, then erase history.", "bad");
      return false;
    }
    if (r && r.ok === false) { console.error("save failed", r.error); say("Could not save history in this browser.", "bad"); return false; }
    return true;
  }

  /* ---------- parsing ---------- */
  /** Run the parse in a worker; fall back to the main thread if it cannot start. */
  function parseFiles(files) {
    const onProg = (p) => progress(true, p.total ? p.done / p.total : 0);
    const main = () => gather(files, globalThis.JSZip, onProg);
    return new Promise((resolve, reject) => {
      let w = null;
      try { w = new Worker("worker.js"); } catch (e) { w = null; }
      if (!w) { main().then(resolve, reject); return; }
      let done = false;
      const bail = (why) => {
        if (done) return;
        done = true;
        console.warn("worker unavailable, parsing on main thread:", why);
        try { w.terminate(); } catch (e) {}
        main().then(resolve, reject);
      };
      w.onerror = () => bail("worker error");
      w.onmessageerror = () => bail("message error");
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === "progress") { onProg(d); return; }
        if (done) return;
        done = true;
        w.terminate();
        if (d.type === "done") resolve(d.result);
        else reject(Object.assign(new Error(d.message || "parse failed"), { name: d.name }));
      };
      try { w.postMessage({ files: files }); } catch (e) { bail(e.message); }
    });
  }

  async function handle() {
    const files = Array.prototype.slice.call($("f").files);
    if (!files.length || busy) return;
    busy = true;
    say("Reading " + files.length + " file(s)...");
    progress(true, 0);
    try {
      const r = await parseFiles(files);
      const p = r.payload;
      if (!p.followers.length || !p.following.length) {
        console.error("incomplete export", r.counts, r.considered);
        say("Need both followers and following. Found " + p.followers.length + " followers and " +
          p.following.length + " following in " + (r.considered.length || "no") +
          " recognised file(s). Upload the whole ZIP without unzipping it.", "bad");
        return;
      }
      const res = S.add(p);
      if (!persist(res)) { /* keep going: data is in memory */ }
      ca = cb = -1; limit = PAGE; sel.clear();
      const extras = Object.keys(p).filter((k) => !["followers", "following"].includes(k) && p[k].length);
      say("Loaded " + p.followers.length + " followers and " + p.following.length + " following. " +
        S.snaps().length + " snapshot(s)." + (extras.length ? " Also read: " + extras.join(", ") + "." : ""), "good");
      render(true);
      $("out").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (e) {
      console.error("parse failed", e);
      say("Could not read those files (" + (e.name || "error") + ": " + (e.message || "unknown") +
        "). Use the ZIP, JSON or HTML exactly as Instagram gave it to you.", "bad");
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
    let out = q ? list.filter((r) => S.name(r.id).toLowerCase().indexOf(q) > -1) : list.slice();
    const so = S.meta().so;
    if (tab === "timeline") out.sort((a, b) => (so === "old" ? a.t - b.t : b.t - a.t));
    else if (so === "az") out.sort((a, b) => S.name(a.id).localeCompare(S.name(b.id), undefined, { sensitivity: "base" }));
    else out.sort((a, b) => (so === "new" ? b.t - a.t : a.t - b.t));
    return out;
  }

  /* ---------- rendering ---------- */
  function render(snapsChanged) {
    if (!S.snaps().length) { $("out").hidden = true; return; }
    $("out").hidden = false;
    const s = S.latest();
    const L = S.lists(ca, cb);

    $("big").textContent = L.notback.length;
    $("sa").textContent = s.fo.length;
    $("sb").textContent = s.fg.length;
    $("sc").textContent = L.mutual.length;

    renderDelta(s);
    renderMismatch(s);
    renderTabs(L);
    const cm = $("cmp");
    cm.hidden = !(S.snaps().length > 1 && (tab === "lost" || tab === "gained"));
    if (!cm.hidden) fillCmp();

    rows = filterSort(buildRows(L));
    renderList();

    const key = S.snaps().length + "|" + s.t;
    if (snapsChanged || key !== chartKey) { chartKey = key; chart(); }
    if ($("mgrbox").hidden === false) renderSnaps();
    renderUsage();
  }

  function renderDelta(s) {
    const days = Math.floor((Date.now() - s.t) / 864e5);
    const prev = S.snaps()[S.snaps().length - 2];
    let t = "LAST UPLOAD: " + (days ? days + " DAYS AGO" : "TODAY");
    if (prev) {
      const A = new Set(prev.fo), B = new Set(s.fo);
      let g = 0, x = 0;
      for (const i of B) if (!A.has(i)) g++;
      for (const i of A) if (!B.has(i)) x++;
      t += " | +" + g + " FOLLOWERS, -" + x + " UNFOLLOWED SINCE " + new Date(prev.t).toLocaleDateString();
    }
    if (days >= 14) t += " | TIME TO REFRESH";
    const d = $("delta");
    d.textContent = t;
    d.style.background = days >= 14 ? "var(--hot)" : "var(--panel)";
    d.style.color = days >= 14 ? "#000" : "var(--ink)";
  }

  /**
   * The most common cause of wrong results is choosing a date range other than
   * "All time", which silently truncates the export. Compare against the count
   * the user can see on their own profile.
   */
  function renderMismatch(s) {
    const claimed = S.meta().claimed;
    const box = $("mismatch");
    if ($("claim").value === "" && claimed != null) $("claim").value = claimed;
    if (claimed == null || !claimed) { box.hidden = true; return; }
    const got = s.fo.length;
    const diff = got - claimed;
    const off = Math.abs(diff) / claimed;
    if (off <= 0.02) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = "MISMATCH: this export has " + got + " followers but your profile says " + claimed +
      " (" + (diff > 0 ? "+" : "") + diff + "). Request a new download with date range set to ALL TIME, " +
      "format JSON, and upload that instead. These numbers are wrong until they match.";
  }

  function renderTabs(L) {
    const n2 = S.snaps().length;
    const vis = TABS.filter(([k]) => {
      if (k === "lost" || k === "gained") return n2 > 1;
      if (k === "timeline") return S.events().length > 0;
      if (k === "notback" || k === "fans" || k === "mutual") return true;
      return (L[k] || []).length > 0;
    });
    if (!vis.some(([k]) => k === tab)) { tab = "notback"; sel.clear(); limit = PAGE; }
    const tb = $("tabs");
    tb.textContent = "";
    for (const [k, title] of vis) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "tab-" + k;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tab === k));
      b.setAttribute("aria-controls", "list");
      b.tabIndex = tab === k ? 0 : -1;
      b.textContent = title + " (" + (k === "timeline" ? S.events().length : (L[k] || []).length) + ")";
      b.onclick = () => { if (tab === k) return; tab = k; S.meta().tab = k; S.save(); sel.clear(); limit = PAGE; render(); };
      tb.appendChild(b);
    }
    $("list").setAttribute("aria-labelledby", "tab-" + tab);
    const hideBtn = $("bhide");
    hideBtn.textContent = tab === "ign" ? "Unhide" : "Hide";
    hideBtn.hidden = tab === "timeline";
    $("bdone").hidden = tab === "timeline" || tab === "ign";
    $("alll").hidden = tab === "timeline";
  }

  function row(r) {
    const u = S.name(r.id);
    const li = document.createElement("li");
    li.className = "r";
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
    cbx.onchange = () => { cbx.checked ? sel.add(r.id) : sel.delete(r.id); syncBulk(); };
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

    const mk = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.dataset.act = text;
      b.onclick = () => fn();
      li.appendChild(b);
    };
    if (tab === "ign") mk("Unhide", () => { S.setFlag("ign", [r.id], false); keepFocus(r.id, "Unhide"); });
    else {
      mk(done ? "Undo" : "Done", () => { persist(S.toggle("done", r.id)); patch(li, r); });
      mk("Hide", () => { S.setFlag("ign", [r.id], true); keepFocus(r.id, "Hide"); });
    }
    return li;
  }

  /** Replace one row without rebuilding the list, so focus and scroll survive. */
  function patch(li, r) {
    const next = row(r);
    const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
    li.replaceWith(next);
    if (act) {
      const b = next.querySelector('button[data-act="' + act + '"]') || next.querySelector("button");
      if (b) b.focus();
    }
  }

  /** The row is leaving the list, so move focus to its neighbour. */
  function keepFocus(id, act) {
    const ul = $("list");
    const items = Array.prototype.slice.call(ul.children);
    const at = items.findIndex((el) => el.dataset && el.dataset.id === String(id));
    sel.delete(id);
    render();
    const after = Array.prototype.slice.call(ul.children);
    const target = after[Math.min(at, after.length - 1)];
    if (!target) { ul.focus(); return; }
    const b = (act && target.querySelector('button[data-act="' + act + '"]')) || target.querySelector("button") || target.querySelector("a");
    (b || ul).focus();
  }

  function renderList() {
    const ul = $("list");
    ul.textContent = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "e";
      li.textContent = $("q").value.trim() ? "NO MATCH." :
        (tab === "lost" || tab === "gained" ? "NOBODY SINCE LAST UPLOAD." : "NOBODY HERE.");
      ul.appendChild(li);
    } else {
      const frag = document.createDocumentFragment();
      for (const r of rows.slice(0, limit)) frag.appendChild(row(r));
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
    for (const b of ["bhide", "bdone"]) {
      $(b).disabled = n === 0;
      const base = b === "bhide" ? (tab === "ign" ? "Unhide" : "Hide") : "Done";
      $(b).textContent = n ? base + " " + n : base;
    }
  }

  function fillCmp() {
    const sn = S.snaps();
    for (const [el, val, pre] of [["ca", ca < 0 ? sn.length - 2 : ca, "FROM "], ["cb", cb < 0 ? sn.length - 1 : cb, "TO "]]) {
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
      inp.onchange = () => { persist(S.label(i, inp.value)); fillCmp(); };
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "DELETE";
      del.onclick = () => {
        if (!confirm("Delete the snapshot from " + new Date(s.t).toLocaleDateString() + "?")) return;
        persist(S.deleteSnapshot(i));
        ca = cb = -1;
        render(true);
        renderSnaps();
      };
      li.append(sp, inp, del);
      ul.appendChild(li);
    });
    if (!S.snaps().length) {
      const li = document.createElement("li");
      li.innerHTML = "";
      li.textContent = "No snapshots.";
      ul.appendChild(li);
    }
  }

  function renderUsage() {
    const b = S.bytes();
    const pct = Math.min(100, Math.round((b / QUOTA_EST) * 100));
    $("usage").textContent = "Using about " + (b / 1024).toFixed(0) + " KB of this browser's roughly 5 MB limit (" +
      pct + "%), across " + S.snaps().length + " snapshot(s) and " + S.raw.names.length + " accounts.";
    $("umeter").style.width = pct + "%";
  }

  function chart() {
    const sn = S.snaps();
    const box = $("chartbox");
    if (sn.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const W = 640, H = 260, P = 40;
    let max = 0, min = Infinity;
    for (const s of sn) {
      max = Math.max(max, s.fo.length, s.fg.length);
      min = Math.min(min, s.fo.length, s.fg.length);
    }
    if (max === min) { max += 1; min -= 1; }
    const X = (i) => P + ((W - 2 * P) * i) / (sn.length - 1);
    const Y = (v) => H - P - ((H - 2 * P) * (v - min)) / (max - min);
    let h = '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="currentColor" stroke-width="4"/>' +
      '<line x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - P) + '" stroke="currentColor" stroke-width="4"/>';
    const line = (key, col, dash) => {
      h += '<polyline points="' + sn.map((s, i) => X(i) + "," + Y(s[key].length)).join(" ") +
        '" fill="none" stroke="' + col + '" stroke-width="6" stroke-dasharray="' + dash + '"/>';
      sn.forEach((s, i) => {
        h += '<rect x="' + (X(i) - 6) + '" y="' + (Y(s[key].length) - 6) + '" width="12" height="12" fill="' + col + '" stroke="currentColor" stroke-width="2"/>';
      });
    };
    line("fo", "#ff3b00", "0");
    line("fg", "currentColor", "12 8");
    h += '<text x="4" y="' + (P + 4) + '" font-size="14" font-family="monospace" fill="currentColor">' + max + "</text>" +
      '<text x="4" y="' + (H - P) + '" font-size="14" font-family="monospace" fill="currentColor">' + min + "</text>";
    const svg = $("chart");
    svg.style.color = getComputedStyle(document.body).color;
    svg.innerHTML = h;
    $("legend").textContent = "Solid orange = followers. Dashed = following. " + sn.length + " snapshots, " +
      new Date(sn[0].t).toLocaleDateString() + " to " + new Date(sn[sn.length - 1].t).toLocaleDateString() + ".";
  }

  /* ---------- export ---------- */
  function csv() {
    const head = tab === "timeline" ? ["event", "username", "date", "profile_url"] : ["username", "list", "follow_date", "done", "hidden", "profile_url"];
    const lines = [head.join(",")];
    for (const r of rows) {
      const u = S.name(r.id);
      const url = "https://www.instagram.com/" + u + "/";
      const cells = tab === "timeline"
        ? [(EV_LABEL[r.ev] || [r.ev])[0], u, new Date(r.t).toISOString().slice(0, 10), url]
        : [u, tab, dstr(r.t), S.meta().done.includes(r.id) ? "yes" : "", S.meta().ign.includes(r.id) ? "yes" : "", url];
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

  $("f").addEventListener("change", handle);
  const dz = $("drop");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("over");
    if (e.dataTransfer.files.length) { $("f").files = e.dataTransfer.files; handle(); }
  });

  let qt = 0;
  $("q").addEventListener("input", () => {
    clearTimeout(qt);
    qt = setTimeout(() => { limit = PAGE; rows = filterSort(buildRows(S.lists(ca, cb))); renderList(); }, 150);
  });
  $("so").addEventListener("change", function () { S.meta().so = this.value; S.save(); limit = PAGE; render(); });
  $("more").onclick = () => { limit += PAGE; renderList(); $("list").lastElementChild && $("list").lastElementChild.scrollIntoView({ block: "nearest" }); };
  $("all").onchange = function () {
    if (this.checked) for (const r of rows) sel.add(r.id);
    else for (const r of rows) sel.delete(r.id);
    renderList();
  };
  $("bhide").onclick = () => {
    const ids = Array.from(sel);
    S.setFlag("ign", ids, tab !== "ign");
    sel.clear();
    limit = PAGE;
    render();
    say((tab === "ign" ? "Unhid " : "Hid ") + ids.length + " account(s).", "good");
  };
  $("bdone").onclick = () => {
    const ids = Array.from(sel);
    persist(S.setFlag("done", ids, true));
    sel.clear();
    render();
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
  $("ca").onchange = function () { ca = +this.value; limit = PAGE; render(); };
  $("cb").onchange = function () { cb = +this.value; limit = PAGE; render(); };

  $("cp").onclick = function () {
    const text = csv();
    const btn = this;
    const ok = () => { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => say("Clipboard blocked. Use the CSV button instead.", "bad"));
    else say("Clipboard unavailable. Use the CSV button instead.", "bad");
  };
  $("dl").onclick = () => download("followback-" + tab + "-" + stamp() + ".csv", csv(), "text/csv;charset=utf-8");
  $("bkdl").onclick = () => download("followback-backup-" + stamp() + ".json", S.exportJson(), "application/json");
  $("bkf").addEventListener("change", async function () {
    const f = this.files && this.files[0];
    if (!f) return;
    restore(await f.text());
    this.value = "";
  });
  $("rs").onclick = () => restore($("bk").value);
  function restore(text) {
    const r = S.importJson(text);
    if (!r.ok) { say("That is not a valid backup (" + r.reason + ").", "bad"); return; }
    ca = cb = -1; limit = PAGE; sel.clear();
    applyTheme();
    $("so").value = S.meta().so;
    $("claim").value = S.meta().claimed == null ? "" : S.meta().claimed;
    say("Backup restored (" + r.count + " snapshots).", "good");
    render(true);
  }
  $("clr").onclick = () => {
    if (!confirm("Erase all saved history in this browser? Download a backup first if you want to keep it.")) return;
    S.clear();
    $("bk").value = "";
    $("out").hidden = true;
    say("History erased.", "good");
  };
  $("claimb").onclick = () => {
    const v = $("claim").value.trim();
    S.meta().claimed = v === "" ? null : Math.max(0, Math.floor(Number(v)));
    persist(S.save());
    render();
    if ($("mismatch").hidden && S.meta().claimed) say("Counts match. Your export is complete.", "good");
  };
  $("claim").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("claimb").click(); } });
  $("mgr").onclick = () => {
    const box = $("mgrbox");
    box.hidden = !box.hidden;
    if (!box.hidden) { renderSnaps(); box.scrollIntoView({ block: "start", behavior: "smooth" }); }
  };
  $("th").onclick = () => {
    const dark = S.meta().th ? S.meta().th === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    S.meta().th = dark ? "light" : "dark";
    persist(S.save());
    applyTheme();
    chart();
  };

  applyTheme();
  $("so").value = S.meta().so;
  if (S.meta().claimed != null) $("claim").value = S.meta().claimed;
  render(true);
  if (migration.migrated) say("Upgraded your saved history to the new, much smaller storage format.", "good");

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker not registered", e));
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
