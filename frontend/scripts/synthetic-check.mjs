import { runSyntheticChecks } from "./lib/synthetic-check.mjs";

const rawBaseUrl = process.env.SYNTHETIC_BASE_URL?.trim();
if (!rawBaseUrl) throw new Error("Set SYNTHETIC_BASE_URL to an authorized staging URL.");
const baseUrl = new URL(rawBaseUrl);
if (baseUrl.username || baseUrl.password) throw new Error("Credentials are not allowed in SYNTHETIC_BASE_URL.");
const local = ["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname);
if (baseUrl.protocol !== "https:" && !(local && baseUrl.protocol === "http:")) {
  throw new Error("Synthetic checks require HTTPS, except for localhost fixtures.");
}

const attempts = Math.min(20, Math.max(1, Number.parseInt(process.env.SYNTHETIC_ATTEMPTS ?? "1", 10) || 1));
const intervalMs = Math.min(60_000, Math.max(0, Number.parseInt(process.env.SYNTHETIC_INTERVAL_MS ?? "0", 10) || 0));
const reports = [];
for (let attempt = 0; attempt < attempts; attempt++) {
  reports.push(await runSyntheticChecks({
    baseUrl: baseUrl.toString(),
    cookie: process.env.SYNTHETIC_COOKIE?.trim() ?? "",
  }));
  if (attempt + 1 < attempts && intervalMs) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

const output = { version: 1, attempts, reports };
console.log(JSON.stringify(output, null, 2));
if (reports.some((report) => !report.summary.passed)) process.exitCode = 1;
