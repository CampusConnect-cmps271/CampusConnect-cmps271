import { mkdir, readFile, writeFile, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const RESIS_DAILY_BUDGET = 40;
export const RESIS_MIN_INTERVAL = 21_000;

async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function saveJSON(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

/** Maintenance-only client. Never import this module into application routes.
 * One persistent directory must be shared by every invocation using this key.
 * Each attempted request is counted before it leaves this process. No retries.
 */
export async function queryResis({ key, method, semesterId, cacheDir,
  fetchImpl = fetch, now = Date.now }) {
  if (!key?.trim()) throw new Error("Set RESIS_API_KEY in frontend/.env.local.");
  if (!["listSemesters", "getSemester"].includes(method)) throw new Error("Unsupported Resis method.");
  if (method === "getSemester" && !/^\d{6}$/.test(String(semesterId))) throw new Error("Supply a six-digit semester ID from listSemesters.");
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const lock = join(cacheDir, "request.lock");
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another Resis operation holds the cache lock. If a process crashed, verify it has stopped before removing request.lock.");
    throw error;
  }
  try {
    const timestamp = now();
    const cachePath = join(cacheDir, method === "listSemesters" ? "semesters.json" : `semester-${semesterId}.json`);
    const cached = await readJSON(cachePath, null);
    const ttl = method === "listSemesters" ? DAY : HOUR;
    if (cached && cached.fetchedAt <= timestamp && timestamp - cached.fetchedAt < ttl) {
      return { ...cached, cached: true };
    }
    const ledgerPath = join(cacheDir, "usage.json");
    const ledger = await readJSON(ledgerPath, { attempts: [], blockedUntil: 0 });
    if (!Array.isArray(ledger.attempts) || ledger.attempts.some((item) => !Number.isFinite(item.at) || typeof item.id !== "string") || !Number.isFinite(ledger.blockedUntil)) {
      throw new Error("Invalid Resis usage ledger; refusing requests until it is reviewed.");
    }
    const attempts = ledger.attempts.filter((item) => timestamp - item.at < DAY);
    const id = `${method}:${semesterId ?? ""}`;
    if (ledger.blockedUntil > timestamp) throw new Error("Resis access is cooling down after an API limit response; use saved data.");
    if (attempts.length >= RESIS_DAILY_BUDGET) throw new Error("Local Resis safety budget reached (40 attempts per rolling 24 hours); use saved data.");
    if (attempts.some((item) => timestamp - item.at < RESIS_MIN_INTERVAL)) throw new Error("Resis requests must be at least 21 seconds apart. No request was sent.");
    if (attempts.some((item) => item.id === id && timestamp - item.at < ttl)) throw new Error("This Resis resource was already attempted recently; no retry was sent. Use its saved response or wait for its cache interval.");
    attempts.push({ id, at: timestamp });
    await saveJSON(ledgerPath, { attempts, blockedUntil: ledger.blockedUntil });
    let response;
    try {
      response = await fetchImpl("https://resis.org/api/", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
        headers: { "X-API-Key": key.trim(), "Content-Type": "application/json", "Accept-Encoding": "gzip" },
        body: JSON.stringify({ method, uniId: "1", ...(method === "getSemester" ? { semesterId: String(semesterId) } : {}) }),
      });
    } catch {
      throw new Error("Resis request failed. Its attempt was counted; no automatic retry will run.");
    }
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const delay = /^\d+$/.test(retry ?? "") ? Number(retry) * 1000 : Date.parse(retry ?? "") - timestamp;
      await saveJSON(ledgerPath, { attempts, blockedUntil: timestamp + Math.max(DAY, Number.isFinite(delay) ? delay : 0) });
    }
    if (!response.ok) throw new Error(`Resis returned HTTP ${response.status}; no retry was sent and existing data was kept.`);
    let data;
    try { data = await response.json(); }
    catch { throw new Error("Resis did not return JSON; no retry was sent."); }
    if (!data || typeof data !== "object" || data.error || data.success === false) throw new Error("Resis returned an API error or invalid response; no retry was sent.");
    const result = { fetchedAt: timestamp, uniId: "1", method, ...(semesterId ? { semesterId: String(semesterId) } : {}), data };
    await saveJSON(cachePath, result);
    return { ...result, cached: false };
  } finally { await rmdir(lock); }
}
