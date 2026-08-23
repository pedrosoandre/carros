/**
 * Fase 1 — Descoberta.
 *
 * Pagina a Sketchfab (licenças CC BY / CC BY-SA — as duas que autorizam uso
 * comercial) e grava os candidatos brutos num JSON. A fase 2 (`*-plan.mjs`)
 * decide slug, categoria, dedup.
 *
 * Idempotente: salva o cursor a cada página; deletar o arquivo força reinício.
 *
 * Dois modos, controlados por env (mesmo padrão de download/process):
 *
 *   SEARCH_MODE=category   →  uma categoria única (default: cars-vehicles).
 *                             É o modo dos carros — a Sketchfab tem categoria
 *                             fixa que casa com o que a gente quer.
 *
 *   SEARCH_MODE=queries    →  N termos textuais em ordem (do mais específico
 *                             ao mais amplo). É o modo dos cenários — garagens
 *                             caem em `architecture`, oficinas às vezes em
 *                             `cars-vehicles`, então categoria única não serve.
 *
 * Env vars:
 *   SKETCHFAB_TOKEN                 obrigatório (lê de env ou .env)
 *   SEARCH_MODE=category|queries    default: category
 *   OUT_FILE                        default: scratch/candidates.json
 *   MIN_FACES / MAX_FACES           default: 3000 / 800000
 *   MIN_BYTES / MAX_BYTES           default: 300000 / 150000000
 *   SEARCH_CATEGORY                 (modo category) default: cars-vehicles
 *   SEARCH_QUERIES                  (modo queries) lista separada por `|`
 *   MAX_PAGES_PER_QUERY             (modo queries) default: 6
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "scratch");
fs.mkdirSync(SCRATCH, { recursive: true });

const MODE = process.env.SEARCH_MODE ?? "category";
if (MODE !== "category" && MODE !== "queries") {
  throw new Error(`SEARCH_MODE inválido: ${MODE} (use "category" ou "queries")`);
}

const OUT = process.env.OUT_FILE
  ? path.resolve(ROOT, process.env.OUT_FILE)
  : path.join(SCRATCH, "candidates.json");

const MIN_FACES = num("MIN_FACES", 3_000);
const MAX_FACES = num("MAX_FACES", 800_000);
const MIN_BYTES = num("MIN_BYTES", 300_000);
const MAX_BYTES = num("MAX_BYTES", 150_000_000);

const TOKEN = readEnv("SKETCHFAB_TOKEN");
const HEADERS = { Authorization: `Token ${TOKEN}` };
const BASE = "https://api.sketchfab.com/v3/search";

let state = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : initState();

if (state.mode && state.mode !== MODE) {
  throw new Error(
    `${path.relative(ROOT, OUT)} foi criado em SEARCH_MODE=${state.mode}; ` +
    `rodando agora como ${MODE}. Delete o arquivo para reiniciar.`,
  );
}
state.mode = MODE;
const seen = new Set(Object.keys(state.seen));

if (MODE === "category") await runCategory();
else await runQueries();

console.log(
  `\nFIM. ${state.candidates.length} candidatos aprovados. ` +
  `Descartes: junk=${state.rejected.junk} heavy=${state.rejected.heavy} dup=${state.rejected.dup}`,
);
console.log(`Salvo em ${path.relative(ROOT, OUT)}`);

// ------------------ modos ------------------
async function runCategory() {
  const category = process.env.SEARCH_CATEGORY ?? "cars-vehicles";
  const initial = buildUrl({ categories: category });
  state.nextCursor ??= initial;
  let cursor = state.nextCursor;
  let pagesThisRun = 0;

  while (cursor) {
    const page = await fetchPage(cursor);
    pagesThisRun++;
    state.pagesFetched++;
    ingest(page.results ?? [], null);
    state.nextCursor = page.next ?? null;
    cursor = state.nextCursor;
    persist();
    if (pagesThisRun % 5 === 0) {
      console.log(
        `pág ${state.pagesFetched}: candidatos=${state.candidates.length} ` +
        `descartes(junk=${state.rejected.junk} heavy=${state.rejected.heavy} dup=${state.rejected.dup})`,
      );
    }
    await sleep(500);
  }
}

async function runQueries() {
  const queries = (process.env.SEARCH_QUERIES ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  if (queries.length === 0) throw new Error("SEARCH_MODE=queries exige SEARCH_QUERIES=term1|term2|...");
  const maxPagesPerQuery = num("MAX_PAGES_PER_QUERY", 6);

  for (const q of queries) {
    state.pagesPerQuery[q] ??= 0;
    let cursor = state.cursors[q];
    if (cursor === null) continue;
    if (!cursor) cursor = buildUrl({ q });
    console.log(`\n== busca: "${q}" (pág ${state.pagesPerQuery[q] + 1}+)`);

    while (cursor && state.pagesPerQuery[q] < maxPagesPerQuery) {
      const page = await fetchPage(cursor);
      state.pagesPerQuery[q]++;
      ingest(page.results ?? [], q);
      cursor = page.next ?? null;
      state.cursors[q] = cursor;
      persist();
      await sleep(500);
    }
    if (state.pagesPerQuery[q] >= maxPagesPerQuery && cursor) {
      console.log(`   cap de ${maxPagesPerQuery} páginas atingido para "${q}"; parando esta query`);
      state.cursors[q] = null;
      persist();
    }
  }
}

// ------------------ helpers ------------------
function initState() {
  const common = { candidates: [], seen: {}, rejected: { junk: 0, heavy: 0, dup: 0 } };
  return MODE === "category"
    ? { ...common, nextCursor: null, pagesFetched: 0 }
    : { ...common, cursors: {}, pagesPerQuery: {} };
}

function ingest(results, matchedQuery) {
  for (const m of results) {
    if (seen.has(m.uid)) { state.rejected.dup++; continue; }
    seen.add(m.uid);
    state.seen[m.uid] = matchedQuery ?? 1;

    const glb = m.archives?.glb;
    const faces = m.faceCount ?? glb?.faceCount ?? 0;
    const bytes = glb?.size ?? 0;
    if (faces < MIN_FACES || faces > MAX_FACES) { state.rejected.junk++; continue; }
    if (bytes < MIN_BYTES || bytes > MAX_BYTES) { state.rejected.heavy++; continue; }

    state.candidates.push({
      uid: m.uid,
      name: m.name,
      description: (m.description ?? "").slice(0, 400),
      viewerUrl: m.viewerUrl,
      publishedAt: m.publishedAt,
      viewCount: m.viewCount,
      likeCount: m.likeCount,
      faceCount: faces,
      vertexCount: m.vertexCount ?? 0,
      glbBytes: bytes,
      license: m.license?.label ?? null,
      author: m.user?.displayName ?? m.user?.username ?? null,
      authorUsername: m.user?.username ?? null,
      authorUrl: m.user?.profileUrl ?? null,
      tags: (m.tags ?? []).map((t) => t.name),
      ...(matchedQuery ? { matchedQuery } : {}),
    });
  }
}

function buildUrl(extra) {
  const p = new URLSearchParams({
    type: "models",
    downloadable: "true",
    count: "24",
    sort_by: "-likeCount",
    ...extra,
  });
  return `${BASE}?${p}&licenses=by&licenses=by-sa`;
}

function persist() { fs.writeFileSync(OUT, JSON.stringify(state, null, 2)); }

async function fetchPage(url, attempt = 1) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? 30);
    console.warn(`429: dormindo ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return fetchPage(url, attempt + 1);
  }
  if (!res.ok) {
    if (attempt < 4) { await sleep(2000 * attempt); return fetchPage(url, attempt + 1); }
    throw new Error(`API ${res.status} em ${url}`);
  }
  return res.json();
}

function num(key, def) {
  const v = process.env[key];
  return v ? Number(v) : def;
}

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
      if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Variável ${key} não encontrada em env nem em .env`);
}
