/**
 * Fase 4 — Processamento gltf-transform.
 *
 * Lê os `.glb` brutos em `scratch/raw/<uid>.glb`, aplica a pipeline:
 *   weld → dedup → prune → simplify (ratio 0.3, error 0.001) → prune → meshopt
 *
 * Salva o arquivo final em `assets/<slug>.glb` usando o slug definido em
 * `download-plan.json`. Rejeita se o resultado ficar acima de MAX_BYTES
 * (default 15 MB). Registra em `scratch/processed.json`.
 *
 * Usa a API programática de @gltf-transform em vez de spawn do CLI —
 * evita processos por arquivo e permite pool de trabalhadores.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// PLAN_FILE / RAW_DIR / ASSETS_DIR / STATE_FILE são sobrescritíveis via env,
// permitindo rodar pipelines paralelas (ex.: scenery em assets/scenery).
const RAW = path.join(ROOT, process.env.RAW_DIR ?? "scratch/raw");
const ASSETS = path.join(ROOT, process.env.ASSETS_DIR ?? "assets");
const PLAN = path.join(ROOT, process.env.PLAN_FILE ?? "scratch/download-plan.json");
const STATE = path.join(ROOT, process.env.STATE_FILE ?? "scratch/processed.json");
fs.mkdirSync(ASSETS, { recursive: true });

const MAX_BYTES = Number(process.env.MAX_BYTES ?? 15 * 1024 * 1024);
const SIMPLIFY_RATIO = Number(process.env.SIMPLIFY_RATIO ?? 0.3);
const SIMPLIFY_ERROR = Number(process.env.SIMPLIFY_ERROR ?? 0.001);

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).plan;
const state = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, "utf8"))
  : { ok: {}, tooBig: {}, missing: {}, error: {} };

let processed = 0;
const start = Date.now();

for (const e of plan) {
  if (state.ok[e.uid] || state.tooBig[e.uid] || state.error[e.uid]) { processed++; continue; }
  const src = path.join(RAW, `${e.uid}.glb`);
  if (!fs.existsSync(src)) { state.missing[e.uid] = e.name; processed++; continue; }
  const dest = path.join(ASSETS, `${e.id}.glb`);
  try {
    const doc = await io.read(src);
    await doc.transform(
      weld({ tolerance: 0.0001 }),
      dedup(),
      prune({ keepAttributes: false, keepLeaves: false }),
      simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }),
      prune({ keepAttributes: false, keepLeaves: false }),
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    const bytes = await io.writeBinary(doc);
    if (bytes.byteLength > MAX_BYTES) {
      state.tooBig[e.uid] = { name: e.name, bytes: bytes.byteLength };
    } else {
      fs.writeFileSync(dest, Buffer.from(bytes));
      const srcBytes = fs.statSync(src).size;
      state.ok[e.uid] = { file: `${e.id}.glb`, bytes: bytes.byteLength, srcBytes, ratio: +(bytes.byteLength / srcBytes).toFixed(3) };
    }
  } catch (err) {
    state.error[e.uid] = { name: e.name, error: String(err.message ?? err) };
  }
  processed++;
  if (processed % 10 === 0) {
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    const oks = Object.keys(state.ok).length;
    const skips = Object.keys(state.tooBig).length;
    const errs = Object.keys(state.error).length;
    const miss = Object.keys(state.missing).length;
    const el = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`processado ${processed}/${plan.length}  ok=${oks} tooBig=${skips} err=${errs} missing=${miss}  ${el}s`);
  }
}

fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
const oks = Object.keys(state.ok).length;
const skips = Object.keys(state.tooBig).length;
const errs = Object.keys(state.error).length;
const miss = Object.keys(state.missing).length;
const totalMB = Object.values(state.ok).reduce((s, x) => s + x.bytes, 0) / 1e6;
console.log(
  `\nFIM. ok=${oks} tooBig=${skips} err=${errs} missing=${miss}  ` +
  `${totalMB.toFixed(0)} MB em assets/`,
);
