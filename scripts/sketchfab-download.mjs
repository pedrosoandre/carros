/**
 * Fase 3 — Download.
 *
 * Lê `scratch/download-plan.json` (Fase 2) e baixa cada .glb para
 * `scratch/raw/<uid>.glb`. Idempotente: skip se o arquivo já existe.
 * Registra progresso incremental em `scratch/downloaded.json`.
 *
 * A URL de download é assinada pela API e expira em 300s, então
 * obtemos a URL e baixamos imediatamente, um modelo por vez.
 * Concorrência: 3 downloads em paralelo.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { setTimeout as sleep } from "timers/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// PLAN_FILE / RAW_DIR / STATE_FILE podem ser sobrescritos para rodar pipelines paralelas
// (carros e scenery, por exemplo) sem colidir com os arquivos padrão.
const PLAN = path.join(ROOT, process.env.PLAN_FILE ?? "scratch/download-plan.json");
const RAW = path.join(ROOT, process.env.RAW_DIR ?? "scratch/raw");
const STATE = path.join(ROOT, process.env.STATE_FILE ?? "scratch/downloaded.json");
fs.mkdirSync(RAW, { recursive: true });

const TOKEN = readEnv("SKETCHFAB_TOKEN");
const HEADERS = { Authorization: `Token ${TOKEN}` };
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const REQ_SLEEP_MS = Number(process.env.REQ_SLEEP_MS ?? 1500);

const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).plan;
const state = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, "utf8"))
  : { ok: {}, fail: {}, startedAt: new Date().toISOString() };

let done = 0, bytesTotal = 0;
const startedAt = Date.now();

async function downloadOne(entry) {
  const dest = path.join(RAW, `${entry.uid}.glb`);
  if (state.ok[entry.uid] && fs.existsSync(dest)) {
    bytesTotal += state.ok[entry.uid].bytes;
    done++;
    return;
  }
  try {
    // 1. pedir URL assinada
    const meta = await fetchJson(`https://api.sketchfab.com/v3/models/${entry.uid}/download`);
    const glbUrl = meta?.glb?.url;
    if (!glbUrl) throw new Error("no glb.url");

    // 2. baixar via streaming (não é autenticada, é URL assinada S3)
    const res = await fetch(glbUrl);
    if (!res.ok) throw new Error(`GLB ${res.status}`);
    const tmp = dest + ".part";
    await pipeline(res.body, fs.createWriteStream(tmp));
    const bytes = fs.statSync(tmp).size;
    fs.renameSync(tmp, dest);

    state.ok[entry.uid] = { bytes, at: new Date().toISOString() };
    bytesTotal += bytes;
    done++;
    if (done % 5 === 0) persist();
  } catch (e) {
    state.fail[entry.uid] = { error: String(e.message ?? e), name: entry.name };
    done++;
    persist();
  }
}

function persist() {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  const mb = (bytesTotal / 1e6).toFixed(0);
  const oks = Object.keys(state.ok).length;
  const fails = Object.keys(state.fail).length;
  console.log(`progresso: ${done}/${plan.length} (ok=${oks} fail=${fails}) ${mb} MB em ${elapsed}s`);
}

// pool simples com concorrência fixa:
const queue = [...plan];
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    await downloadOne(e);
    await sleep(REQ_SLEEP_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
persist();
console.log(
  `FIM. ok=${Object.keys(state.ok).length} fail=${Object.keys(state.fail).length} ` +
  `total=${(bytesTotal / 1e9).toFixed(2)} GB em ${((Date.now() - startedAt) / 60000).toFixed(1)} min`,
);

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429) {
    const ra = Number(res.headers.get("Retry-After") ?? 30);
    console.warn(`429: dormindo ${ra}s`);
    await sleep(ra * 1000);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) {
    if (attempt < 3) { await sleep(2000 * attempt); return fetchJson(url, attempt + 1); }
    throw new Error(`API ${res.status}`);
  }
  return res.json();
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
  throw new Error(`Variável ${key} não encontrada`);
}
