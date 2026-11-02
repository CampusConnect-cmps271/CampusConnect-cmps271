/**
 * SCRUM-51 / SP3-40: fetch the curated official AUB pages listed in
 * supabase/data/campus-sources.json, split them into text chunks and upsert
 * them for the campus assistant. Rerunning refreshes retrieved_at and any
 * changed text; chunks of a shortened page are trimmed.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveImportTarget } from "./import-courses.mjs";

export const MAX_CHUNK_CHARS = 900;
const MAX_PAGE_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 20_000;
const OFFICIAL_HOST = /(^|\.)aub\.edu\.lb$/;

const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_HOST.test(url.hostname);
  }, "Sources must be https pages on aub.edu.lb"),
  title: z.string().trim().min(1).max(300),
  publisher: z.string().trim().min(1).max(200),
  published_at: z.iso.date().optional(),
  start_after: z.string().min(1).optional(),
  end_before: z.string().min(1).optional(),
});
const manifestSchema = z.array(sourceSchema).min(1).max(50)
  .refine((sources) => new Set(sources.map((source) => source.id)).size === sources.length, "Source ids must be unique");

export function parseManifest(json) {
  return manifestSchema.parse(JSON.parse(json));
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The readable text of a page's main content, one paragraph per line. */
export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|nav|header|footer|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);|&#x([0-9a-f]+);|&([a-z]+);/gi, (match, dec, hex, name) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? Number(dec) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/[​-‍⁠﻿]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .join("\n");
}

// Every aub.edu.lb page ends its content with this footer, so it is the default end.
const FOOTER_LINE = "For various questions, please try contacting us via social media first!";
const NOISE_LINE = /^(Contact Us|Learn More|read more|Page (Content|Image)|Rollup Image|Section\d+ (Content|Image)|Box Content|Recent Currently selected)$/;

/**
 * Keeps the lines between the source's `start_after` and `end_before` markers
 * (whole lines of htmlToText output), dropping SharePoint filler. A missing
 * marker means the page layout changed, so fail instead of storing chrome.
 */
export function selectContent(text, { start_after, end_before = FOOTER_LINE } = {}) {
  let lines = text.split("\n");
  if (start_after !== undefined) {
    const start = lines.indexOf(start_after);
    if (start < 0) throw new Error(`start marker not found: "${start_after}"`);
    lines = lines.slice(start + 1);
  }
  const end = lines.indexOf(end_before);
  if (end < 0) throw new Error(`end marker not found: "${end_before}"`);
  return lines.slice(0, end).filter((line) => !NOISE_LINE.test(line)).join("\n");
}

/** Packs paragraphs into chunks of at most MAX_CHUNK_CHARS characters. */
export function chunkText(text, max = MAX_CHUNK_CHARS) {
  const chunks = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (let line of text.split("\n")) {
    while (line.length > max) {
      const cut = line.lastIndexOf(" ", max);
      flush();
      chunks.push(line.slice(0, cut > 0 ? cut : max));
      line = line.slice(cut > 0 ? cut + 1 : max);
    }
    if (current && current.length + 1 + line.length > max) flush();
    current = current ? `${current}\n${line}` : line;
  }
  flush();
  return chunks;
}

export const contentHash = (text) => createHash("sha256").update(text).digest("hex");

export async function fetchPage(source, fetchImpl = fetch) {
  const response = await fetchImpl(source.url, {
    headers: { "User-Agent": "CampusConnect-ingest/1.0 (university project)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // A redirect off aub.edu.lb must not become a citable source.
  if (!response.ok || !OFFICIAL_HOST.test(new URL(response.url || source.url).hostname)) {
    throw new Error(`${source.id}: HTTP ${response.status} from ${new URL(response.url || source.url).hostname}`);
  }
  const html = await response.text();
  if (html.length > MAX_PAGE_BYTES) throw new Error(`${source.id}: page larger than ${MAX_PAGE_BYTES} bytes`);
  return { html, url: response.url || source.url };
}

/** Builds the rows for one source. Throws if the page has no usable text. */
export function buildRows(source, page, retrievedAt) {
  let text;
  try {
    text = selectContent(htmlToText(page.html), source);
  } catch (error) {
    throw new Error(`${source.id}: ${error.message}`);
  }
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error(`${source.id}: no text found on the page`);
  return {
    source: {
      id: source.id,
      url: page.url,
      title: source.title,
      publisher: source.publisher,
      published_at: source.published_at ?? null,
      retrieved_at: retrievedAt,
      content_hash: contentHash(text),
    },
    chunks: chunks.map((chunk, position) => ({ id: `${source.id}:${position}`, source_id: source.id, position, text: chunk })),
  };
}

export async function saveRows(client, { source, chunks }) {
  const fail = (step, error) => new Error(`${source.id}: ${step} failed (database code: ${error.code ?? "unknown"}).`);
  const saved = await client.from("campus_sources").upsert(source, { onConflict: "id" });
  if (saved.error) throw fail("saving the source", saved.error);
  const upserted = await client.from("campus_source_chunks").upsert(chunks, { onConflict: "id" });
  if (upserted.error) throw fail("saving the chunks", upserted.error);
  const trimmed = await client.from("campus_source_chunks").delete()
    .eq("source_id", source.id).gte("position", chunks.length);
  if (trimmed.error) throw fail("trimming old chunks", trimmed.error);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      hosted: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage: npm run ingest:campus-sources [-- --dry-run] [-- --hosted]");
    return;
  }

  const sources = parseManifest(await readFile(new URL("../../supabase/data/campus-sources.json", import.meta.url), "utf8"));
  // Fetch and validate everything before opening a connection or writing.
  const retrievedAt = new Date().toISOString();
  const rows = [];
  for (const source of sources) {
    const built = buildRows(source, await fetchPage(source), retrievedAt);
    console.log(`${source.id}: ${built.chunks.length} chunks from ${built.source.url}`);
    rows.push(built);
  }
  if (values["dry-run"]) {
    console.log("Dry run complete; no database connection or writes.");
    return;
  }

  if (values.hosted) {
    try {
      process.loadEnvFile(".env.hosted.local");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const target = resolveImportTarget(process.env, values.hosted);
  console.log(`Target: ${target.url}`);
  if (values.hosted) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const confirmation = await prompt.question(`Type project ref ${target.projectRef} to update this hosted source collection: `);
      if (confirmation.trim() !== target.projectRef) throw new Error("Project ref did not match; ingestion cancelled.");
    } finally {
      prompt.close();
    }
  }

  const client = createClient(target.url, target.key, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const row of rows) await saveRows(client, row);
  console.log(`Complete: ${rows.length} sources upserted. Sources absent from the manifest were kept.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ingest:campus-sources failed: ${error.message}`);
    process.exitCode = 1;
  });
}
