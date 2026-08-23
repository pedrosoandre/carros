/**
 * Fase 2 (scenery) — Slug + kind + plano.
 *
 * Lê `scratch/scenery-candidates.json` e produz `scratch/scenery-plan.json`:
 *  - infere o `kind` (garage, workshop, showroom, gas-station, parking, other)
 *    a partir de nome + tags + termo de busca casado
 *  - gera slug canônico a partir do nome ("Old Garage" → "old-garage").
 *    Prefixa com o kind se o nome não deixa claro (evita "old-garage" colidir
 *    com um showroom chamado "old").
 *  - descarta duplicatas contra `scenery.json` atual (URL e slug)
 *  - resolve colisões internas de slug pelo likeCount
 *  - ordena por likes, corta em TOP (default 35)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAND = path.join(ROOT, "scratch", "scenery-candidates.json");
const SCENERY = path.join(ROOT, "scenery.json");
const OUT = path.join(ROOT, "scratch", "scenery-plan.json");
const REJECT = path.join(ROOT, "scratch", "scenery-plan-rejects.json");

const TOP = Number(process.env.TOP ?? 35);

// heurística de kind — ordem importa (mais específica antes)
const KIND_KEYWORDS = [
  ["gas-station", ["gas station", "gas-station", "petrol", "posto de combust", "posto de gasolina", "fuel station"]],
  ["parking", ["parking", "estacionamento", "car park", "carpark", "parking garage", "parking lot"]],
  ["showroom", ["showroom", "dealership", "concession", "concessionar"]],
  ["workshop", ["workshop", "mechanic", "repair shop", "auto shop", "oficina", "body shop", "car repair"]],
  ["garage", ["garage", "garagem", "car port", "carport"]],
];

// Só confia em kind quando a palavra-chave está no NOME ou nas TAGS do próprio
// modelo. `matchedQuery` sozinho gera falsos positivos: um carro isolado com tag
// "garage" na descrição vem pela busca "garage", mas não é um cenário de garagem.
function inferKind(name, tags = []) {
  const hay = (name + " " + tags.join(" ")).toLowerCase();
  for (const [kind, keys] of KIND_KEYWORDS) {
    if (keys.some((k) => hay.includes(k))) return kind;
  }
  return "other";
}

const norm = (s) =>
  (s ?? "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function stripCommon(text) {
  return text
    .replace(/\bfree\b/gi, "")
    .replace(/\[[^\]]*\]/gi, "")
    .replace(/\(\s*free[^)]*\)/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\b3d\s*model\b/gi, "")
    .replace(/\bdownload\b/gi, "")
    .replace(/\bpbr\b/gi, "")
    .replace(/\blowpoly\b/gi, "")
    .replace(/\blow[\s-]?poly\b/gi, "")
    .replace(/\|.*$/, "")
    .replace(/[^\p{L}\p{N} .\-']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromName(name, kind) {
  let s = norm(stripCommon(name));
  // até 4 palavras para não gerar slug enorme
  s = s.split(" ").filter(Boolean).slice(0, 4).join("-");
  // se não menciona o kind, prefixa (ex.: "old-brutalist" → "workshop-old-brutalist")
  if (kind !== "other" && !s.includes(kind)) s = `${kind}-${s}`;
  return s.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function friendlyName(name) {
  return stripCommon(name)
    .split(" ").filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 80) || "Untitled";
}

// -------------------- execução --------------------
const cand = JSON.parse(fs.readFileSync(CAND, "utf8")).candidates;
const scenery = fs.existsSync(SCENERY) ? JSON.parse(fs.readFileSync(SCENERY, "utf8")).scenery ?? [] : [];

const existingIds = new Set(scenery.map((s) => s.id));
const existingUrls = new Set(scenery.map((s) => s.credit?.sourceUrl).filter(Boolean));

const enriched = [];
const rejected = { existingUrl: [], noSlug: [], notScenery: [] };

for (const c of cand) {
  if (existingUrls.has(c.viewerUrl)) { rejected.existingUrl.push(c); continue; }
  const kind = inferKind(c.name, c.tags);
  if (kind === "other") { rejected.notScenery.push(c); continue; }
  const id = slugFromName(c.name, kind);
  if (!id || id.length < 3) { rejected.noSlug.push(c); continue; }
  enriched.push({
    uid: c.uid,
    id,
    name: friendlyName(c.name),
    kind,
    likeCount: c.likeCount,
    viewCount: c.viewCount,
    faceCount: c.faceCount,
    glbBytes: c.glbBytes,
    license: c.license,
    author: c.author,
    authorUrl: c.authorUrl,
    sourceUrl: c.viewerUrl,
    sourceName: c.name,
    tags: c.tags,
  });
}

// dedup interno: mesmo slug → mais likes vence
const bySlug = new Map();
for (const e of enriched) {
  if (existingIds.has(e.id)) continue;
  const prev = bySlug.get(e.id);
  if (!prev || e.likeCount > prev.likeCount) bySlug.set(e.id, e);
}
const uniq = [...bySlug.values()];
uniq.sort((a, b) => b.likeCount - a.likeCount);

const plan = uniq.slice(0, TOP);
const totalGB = plan.reduce((s, x) => s + x.glbBytes, 0) / 1e9;

fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  top: TOP,
  count: plan.length,
  rawGB: +totalGB.toFixed(2),
  plan,
}, null, 2));

fs.writeFileSync(REJECT, JSON.stringify({
  counts: {
    total: cand.length,
    existingUrl: rejected.existingUrl.length,
    notScenery: rejected.notScenery.length,
    noSlug: rejected.noSlug.length,
    enriched: enriched.length,
    afterDedup: uniq.length,
    picked: plan.length,
  },
  notScenerySample: rejected.notScenery.slice(0, 10).map((c) => c.name),
  noSlugSample: rejected.noSlug.slice(0, 10).map((c) => c.name),
}, null, 2));

console.log(`recebidos: ${cand.length}`);
console.log(`bateu URL existente: ${rejected.existingUrl.length}`);
console.log(`kind indefinido (nome/tags sem palavra de cenário): ${rejected.notScenery.length}`);
console.log(`sem slug: ${rejected.noSlug.length}`);
console.log(`após dedup: ${uniq.length}`);
console.log(`plano final (top ${TOP}): ${plan.length} cenários, ${totalGB.toFixed(1)} GB bruto`);
console.log(`\ndistribuição por kind:`);
const byKind = {};
for (const p of plan) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
Object.entries(byKind).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k.padEnd(14)} ${n}`));
