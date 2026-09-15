/* =====================================================================
   build.js  —  regenerates data.json for the Ishiyama-dera calendar.
   Runs on GitHub's servers every week (see .github/workflows/refresh.yml).
   No dependencies, no network, no secrets. Pure date math over
   events-source.json, filtered to a rolling six-month window from "today".
   "today" is Japan time because the workflow sets TZ=Asia/Tokyo.
   ===================================================================== */
const fs = require("fs");

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const src = JSON.parse(fs.readFileSync("events-source.json", "utf8"));

// ---- window: today .. today + 6 months (Japan time) ----
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const end = new Date(start.getFullYear(), start.getMonth() + 6, start.getDate());

const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const mLabel = d => MON[d.getMonth()] + " " + d.getFullYear();
const inWindow = d => d >= start && d <= end;
const overlaps = (a,b) => a <= end && b >= start;   // event [a,b] intersects window

const out = [];
const push = (date, o) => out.push(Object.assign({
  m: mLabel(date), d: String(date.getDate()), dow: DOW[date.getDay()], iso: iso(date)
}, o));

// ---- recurring monthly events ----
// walk each month touched by the window
let cur = new Date(start.getFullYear(), start.getMonth(), 1);
while (cur <= end) {
  const y = cur.getFullYear(), mo = cur.getMonth();
  for (const r of (src.recurringMonthly || [])) {
    let day;
    if (r.kind === "dayOfMonth") day = r.day;
    else if (r.kind === "nthWeekday") {
      // n-th given weekday of the month
      const first = new Date(y, mo, 1).getDay();
      day = 1 + ((7 + r.weekday - first) % 7) + (r.n - 1) * 7;
    } else continue;
    const date = new Date(y, mo, day);
    if (date.getMonth() !== mo) continue;      // e.g. 5th Sunday overflow
    if (!inWindow(date)) continue;
    const ev = { jp: r.jp, en: r.en, tier: r.tier, status: r.status, url: r.url };
    if (r.rangeLabel) ev.range = r.rangeLabel;
    if (r.noDay) { ev.d = "-"; ev.dow = ""; }
    if (r.nt) ev.nt = r.nt;
    push(date, ev);
  }
  cur = new Date(y, mo + 1, 1);
}

// ---- annual fixed-date events (regenerate every year) ----
for (const a of (src.annualFixed || [])) {
  for (let y = start.getFullYear() - 1; y <= end.getFullYear() + 1; y++) {
    const s = new Date(y, a.mm - 1, a.dd);
    const e = (a.endMm ? new Date(y, a.endMm - 1, a.endDd) : s);
    if (!overlaps(s, e)) continue;
    const ev = { jp: a.jp, en: a.en, tier: a.tier, status: a.status, url: a.url };
    if (a.endMm) ev.range = MON[a.mm-1] + " " + a.dd + " - " + a.endDd;
    if (a.nt) ev.nt = a.nt;
    push(s, ev);
  }
}

// ---- explicit dated events (variable / one-off, maintained by hand) ----
for (const t of (src.dated || [])) {
  const s = parse(t.iso);
  const e = t.endIso ? parse(t.endIso) : s;
  if (!overlaps(s, e)) continue;
  const ev = { jp: t.jp, en: t.en, tier: t.tier, status: t.status, url: t.url };
  if (t.range) ev.range = t.range;
  if (t.nt) ev.nt = t.nt;
  push(s, ev);
}

// ---- sort by date, then write ----
out.sort((a,b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);

// next Monday (for the "next refresh" stamp)
const nextMon = new Date(start);
nextMon.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
const fmt = d => d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();

const data = {
  updated: fmt(start),
  windowLabel: fmt(start) + " to end " + MON[end.getMonth()] + " " + end.getFullYear(),
  nextRefresh: "Mon " + fmt(nextMon) + ", 07:00 JST",
  events: out
};

fs.writeFileSync("data.json", JSON.stringify(data, null, 2) + "\n");
console.log("Wrote data.json:", out.length, "events |", data.windowLabel, "| updated", data.updated);
