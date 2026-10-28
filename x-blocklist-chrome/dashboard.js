const api = globalThis.browser ?? chrome; // Firefox exposes `browser`, Chromium browsers `chrome`
const $ = (id) => document.getElementById(id);
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
let records = {};      // lowercase handle -> {handle, status, time, note}
let running = false;
let stopFlag = false;
let pendingHandles = [];

/* ---------- storage ---------- */
async function load() {
  const d = await api.storage.local.get(["records", "delay"]);
  records = d.records || {};
  if (d.delay) $("delay").value = d.delay;
}
const save = () => api.storage.local.set({ records });

/* ---------- parsing ---------- */
function splitCells(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (!q && (c === "," || c === "\t" || c === ";")) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function cleanHandle(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']+|["']+$/g, "");
  const url = s.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  if (url) s = url[1];
  s = s.replace(/^@/, "");
  return HANDLE_RE.test(s) ? s : null;
}

function parseHandles(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { handles: [], invalid: 0 };
  let col = 0, start = 0;
  const first = splitCells(lines[0]).map((c) => c.toLowerCase());
  const idx = first.findIndex((c) => /^@?(handle|username|user name|screen_?name|screen name|user)$/.test(c));
  if (idx >= 0) { col = idx; start = 1; }

  const seen = new Set(); const handles = []; let invalid = 0;
  const add = (cell) => {
    const h = cleanHandle(cell);
    if (!h) { invalid++; return; }
    if (!seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); handles.push(h); }
  };
  if (lines.length === 1 && idx < 0) {
    // single line like "a, b, c" or "a b c"
    lines[0].split(/[\s,;\t]+/).filter(Boolean).forEach(add);
  } else {
    for (let i = start; i < lines.length; i++) {
      const cells = splitCells(lines[i]);
      let cell = cells[col] ?? "";
      // allow a trailing comment ("handle  # reason"), but never guess a handle out of free text
      cell = cell.replace(/\s+(#|\/\/).*$/, "").trim();
      add(cell);
    }
  }
  return { handles, invalid };
}

function refreshParsed() {
  const { handles, invalid } = parseHandles($("input").value);
  pendingHandles = handles;
  $("parsed").textContent = handles.length
    ? `${handles.length} unique handle(s) detected` + (invalid ? `, ${invalid} line(s) skipped` : "")
    : "";
  $("btnBlock").disabled = $("btnUnblockList").disabled = running || !handles.length;
}

$("input").addEventListener("input", refreshParsed);
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("input").value = await f.text();
  refreshParsed();
});

/* ---------- connection to x.com tab ---------- */
async function findXTab() {
  const tabs = await api.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  return tabs[0] || null;
}

async function checkConnection() {
  const el = $("conn");
  const tab = await findXTab();
  if (!tab) {
    el.className = "banner warn";
    el.innerHTML = 'No x.com tab open. <a href="https://x.com/home" target="_blank">Open x.com</a> and log in, then come back.';
    return false;
  }
  try {
    const r = await api.tabs.sendMessage(tab.id, { type: "xbl-ping" });
    if (!r.loggedIn) {
      el.className = "banner bad";
      el.textContent = "Connected to an x.com tab, but you don't appear to be logged in.";
      return false;
    }
    el.className = "banner ok";
    el.textContent = "Connected to your logged-in x.com tab.";
    return true;
  } catch (e) {
    el.className = "banner bad";
    el.textContent = "Can't reach the x.com tab. Reload your x.com tab (F5) so the extension can attach, then try again.";
    return false;
  }
}

async function callX(action, handle) {
  const tab = await findXTab();
  if (!tab) return { ok: false, fatal: true, message: "No x.com tab open." };
  try {
    return await api.tabs.sendMessage(tab.id, { type: "xbl-api", action, handle });
  } catch (e) {
    return { ok: false, fatal: true, message: "Lost connection to x.com tab (reload it)." };
  }
}

/* ---------- queue runner ---------- */
// Sleep via a dedicated worker: main-thread timers get throttled hard in background tabs
// (Chrome wakes hidden pages about once a minute), which would stall long runs.
let timerWorker = null;
let timerSeq = 0;
const timerWaiters = new Map();
function sleep(ms) {
  try {
    if (!timerWorker) {
      timerWorker = new Worker("timer-worker.js");
      timerWorker.onmessage = (e) => { const r = timerWaiters.get(e.data.id); timerWaiters.delete(e.data.id); if (r) r(); };
    }
    return new Promise((resolve) => {
      const id = ++timerSeq;
      timerWaiters.set(id, resolve);
      timerWorker.postMessage({ id, ms });
    });
  } catch (_) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

async function interruptibleWait(ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopFlag) {
    if (label) $("runText").textContent = `${label} ${Math.ceil((end - Date.now()) / 1000)}s`;
    await sleep(500);
  }
}

async function runQueue(action, handles) {
  if (running || !handles.length) return;
  if (!(await checkConnection())) return;
  running = true; stopFlag = false;
  setBusy(true);
  const delay = Math.max(0.5, parseFloat($("delay").value) || 2);
  await api.storage.local.set({ delay });
  $("runCard").hidden = false;
  $("bar").max = handles.length; $("bar").value = 0;

  let done = 0, okCount = 0, failCount = 0, fatalMsg = "";
  for (const handle of handles) {
    if (stopFlag) break;
    const key = handle.toLowerCase();
    // skip pointless work
    if (action === "block" && records[key]?.status === "blocked") { done++; $("bar").value = done; continue; }

    let result;
    for (let attempt = 0; attempt < 5 && !stopFlag; attempt++) {
      $("runText").textContent = `${action === "block" ? "Blocking" : "Unblocking"} @${handle} (${done + 1}/${handles.length})`;
      result = await callX(action, handle);
      if (result.status === 429 || result.code === 88) {
        const wait = result.resetAt ? Math.max(5000, result.resetAt - Date.now() + 2000) : 15 * 60 * 1000;
        await interruptibleWait(Math.min(wait, 16 * 60 * 1000), "Rate limited by X — resuming in");
        continue;
      }
      break;
    }
    if (stopFlag && (!result || result.status === 429)) break;

    const now = Date.now();
    if (result.ok) {
      records[key] = { handle, status: action === "block" ? "blocked" : "unblocked", time: now, note: "" };
      okCount++;
    } else if (result.fatal || result.status === 401 || result.status === 403 || [64, 326, 226, 32, 89].includes(result.code)) {
      fatalMsg = result.message || `HTTP ${result.status}`;
      records[key] = { handle, status: "failed", time: now, note: fatalMsg };
      await save();
      break;
    } else if (result.code === 50 || result.code === 63 || result.status === 404) {
      records[key] = { handle, status: "notfound", time: now, note: result.message || "User not found / suspended" };
      failCount++;
    } else {
      records[key] = { handle, status: "failed", time: now, note: result.message || `HTTP ${result.status}` };
      failCount++;
    }
    done++; $("bar").value = done;
    await save(); render();
    await interruptibleWait(delay * 1000 * (1 + Math.random() * 0.6));
  }

  running = false;
  setBusy(false);
  $("runText").textContent =
    (fatalMsg ? `Stopped: ${fatalMsg}. ` : stopFlag ? "Stopped. " : "Finished. ") +
    `${okCount} succeeded, ${failCount} not found/failed, ${done}/${handles.length} processed.`;
  await save(); render(); refreshParsed();
}

function setBusy(b) {
  ["btnBlock", "btnUnblockList", "btnUnblockSel", "btnUnblockAll", "btnClear"].forEach((id) => ($(id).disabled = b));
  $("btnStop").disabled = !b;
}

$("btnStop").addEventListener("click", () => { stopFlag = true; });
$("btnBlock").addEventListener("click", () => {
  if (confirm(`Block ${pendingHandles.length} account(s) on X?`)) runQueue("block", pendingHandles);
});
$("btnUnblockList").addEventListener("click", () => {
  if (confirm(`Unblock ${pendingHandles.length} account(s) on X?`)) runQueue("unblock", pendingHandles);
});

/* ---------- history table ---------- */
function selectedHandles() {
  return [...document.querySelectorAll(".rowsel:checked")].map((c) => c.dataset.h);
}

function visibleRecords() {
  const f = $("filter").value;
  const q = $("search").value.trim().toLowerCase().replace(/^@/, "");
  return Object.values(records)
    .filter((r) => (f === "all" || r.status === f) && (!q || r.handle.toLowerCase().includes(q)))
    .sort((a, b) => b.time - a.time);
}

function render() {
  const rows = visibleRecords();
  const all = Object.values(records);
  const n = (s) => all.filter((r) => r.status === s).length;
  $("counts").textContent = `${n("blocked")} blocked · ${n("unblocked")} unblocked · ${n("notfound")} not found · ${n("failed")} failed`;
  const tb = $("rows");
  tb.textContent = "";
  for (const r of rows.slice(0, 2000)) {
    const tr = document.createElement("tr");
    const td = (child) => { const t = document.createElement("td"); if (child instanceof Node) t.appendChild(child); else t.textContent = child; tr.appendChild(t); return t; };
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "rowsel"; cb.dataset.h = r.handle;
    td(cb);
    const a = document.createElement("a"); a.href = `https://x.com/${r.handle}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = "@" + r.handle;
    td(a);
    const st = td(r.status); st.className = "st-" + r.status;
    td(new Date(r.time).toLocaleString());
    td(r.note || "");
    tb.appendChild(tr);
  }
  if (rows.length > 2000) {
    const tr = document.createElement("tr"); const t = document.createElement("td"); t.colSpan = 5;
    t.textContent = `Showing first 2000 of ${rows.length}. Use search/filter or export CSV for all.`; tr.appendChild(t); tb.appendChild(tr);
  }
}

$("filter").addEventListener("change", render);
$("search").addEventListener("input", render);
$("selAll").addEventListener("change", (e) => document.querySelectorAll(".rowsel").forEach((c) => (c.checked = e.target.checked)));

$("btnUnblockSel").addEventListener("click", () => {
  const hs = selectedHandles();
  if (!hs.length) return alert("Select some rows first.");
  if (confirm(`Unblock ${hs.length} selected account(s)?`)) runQueue("unblock", hs);
});
$("btnUnblockAll").addEventListener("click", () => {
  const hs = Object.values(records).filter((r) => r.status === "blocked").map((r) => r.handle);
  if (!hs.length) return alert("Nothing to unblock.");
  if (confirm(`Unblock ALL ${hs.length} account(s) this tool blocked?`)) runQueue("unblock", hs);
});
$("btnClear").addEventListener("click", async () => {
  if (!confirm("Clear the local history? This does NOT unblock anyone on X.")) return;
  records = {}; await save(); render();
});
$("btnExport").addEventListener("click", () => {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["handle,status,time,note", ...Object.values(records).map((r) => [r.handle, r.status, new Date(r.time).toISOString(), esc(r.note)].join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = "x-block-history.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ---------- init ---------- */
(async () => {
  await load();
  setBusy(false);
  render();
  refreshParsed();
  checkConnection();
  setInterval(() => { if (!running) checkConnection(); }, 10000);
})();
