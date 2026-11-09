#!/usr/bin/env node
/**
 * Bundle size report (T11). Uses Node's zlib on built dist entry files — no extra deps.
 * Measures packed (file bytes) and gzipped bytes for public entry points.
 * Exits 1 if browser entry gzipped exceeds BUDGET_BROWSER_GZIP (current + 10%, tighten in follow-ups).
 */
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const entries = [
  ["browser", "dist/browser/index.js"],
  ["node", "dist/node/index.js"],
  ["react", "dist/react/index.js"],
  ["pod", "dist/pod.js"],
];
// Budget: browser gzipped <= 261 bytes (measured 237 B on 2026-11-09, +10% rounded up). Raise only with HD entry.
const BUDGET_BROWSER_GZIP = 261;

function measure(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return { packed: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
}

const rows = [];
let fail = false;
for (const [name, file] of entries) {
  const m = measure(file);
  if (!m) { rows.push([name, file, "MISSING", "MISSING", "-"]); fail = true; continue; }
  const budget = name === "browser" ? BUDGET_BROWSER_GZIP : "-";
  const ok = name !== "browser" || m.gzip <= BUDGET_BROWSER_GZIP;
  if (!ok) fail = true;
  rows.push([name, file, String(m.packed), String(m.gzip), String(budget) + (ok ? "" : " FAIL")]);
}
console.log("| Entry | File | Packed (B) | Gzipped (B) | Budget gzip (B) |");
console.log("|---|---|---:|---:|---:|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
if (fail) { console.error("size check failed"); process.exit(1); }
