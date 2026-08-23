/**
 * Fase 2 — Dedup + slug + plano.
 *
 * Lê `scratch/candidates.json` (Fase 1) e produz `scratch/download-plan.json`:
 *  - detecta marca a partir do nome (lista de marcas conhecidas)
 *  - extrai modelo cru como o resto do nome, sem ano
 *  - gera slug canônico `<marca>-<modelo>`
 *  - descarta duplicatas contra o catálogo atual (`cars.json`) por URL e por slug
 *  - entre candidatos com mesmo slug, mantém o de mais likes
 *  - ordena por likes e corta em TOP (default 800)
 *
 * Saída: `scratch/download-plan.json` com os N modelos a baixar.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAND = path.join(ROOT, "scratch", "candidates.json");
const CARS = path.join(ROOT, "cars.json");
const OUT = path.join(ROOT, "scratch", "download-plan.json");
const REJECT = path.join(ROOT, "scratch", "plan-rejects.json");

const TOP = Number(process.env.TOP ?? 800);

// Marcas conhecidas — ordem importa (mais específicas antes das genéricas).
// "Land Rover" antes de "Rover" porque "Range Rover Sport" bateria em "Rover".
const BRANDS = [
  ["Alfa Romeo", ["alfa romeo", "alfaromeo", "alfa-romeo"]],
  ["Aston Martin", ["aston martin", "astonmartin", "aston-martin"]],
  ["Land Rover", ["land rover", "landrover", "land-rover", "range rover"]],
  ["Rolls-Royce", ["rolls royce", "rolls-royce", "rollsroyce"]],
  ["Mercedes-Benz", ["mercedes-benz", "mercedes benz", "mercedes", "mercedez", "benz"]],
  ["Lynk & Co", ["lynk & co", "lynk&co", "lynkco"]],
  ["Great Wall", ["great wall", "greatwall", "gwm"]],
  ["Audi", ["audi"]], ["BMW", ["bmw"]], ["Bentley", ["bentley"]],
  ["Bugatti", ["bugatti"]], ["Buick", ["buick"]], ["Cadillac", ["cadillac"]],
  ["Chery", ["chery"]], ["Chevrolet", ["chevrolet", "chevy"]], ["Chrysler", ["chrysler"]],
  ["Citroen", ["citroen", "citroën"]], ["Dacia", ["dacia"]], ["Daewoo", ["daewoo"]],
  ["Datsun", ["datsun"]], ["Dodge", ["dodge"]], ["Ferrari", ["ferrari"]],
  ["Fiat", ["fiat"]], ["Ford", ["ford"]], ["Genesis", ["genesis"]],
  ["GMC", ["gmc"]], ["Honda", ["honda"]], ["Hummer", ["hummer"]],
  ["Hyundai", ["hyundai"]], ["Infiniti", ["infiniti"]], ["Jaguar", ["jaguar"]],
  ["Jeep", ["jeep"]], ["Kia", ["kia"]], ["Koenigsegg", ["koenigsegg"]],
  ["Lada", ["lada"]], ["Lamborghini", ["lamborghini", "lambo"]],
  ["Lancia", ["lancia"]], ["Lexus", ["lexus"]], ["Lincoln", ["lincoln"]],
  ["Lotus", ["lotus"]], ["Maserati", ["maserati"]], ["Maybach", ["maybach"]],
  ["Mazda", ["mazda"]], ["McLaren", ["mclaren"]], ["Mini", ["mini cooper", "mini "]],
  ["Mitsubishi", ["mitsubishi"]], ["Nissan", ["nissan"]], ["Opel", ["opel"]],
  ["Pagani", ["pagani"]], ["Peugeot", ["peugeot"]], ["Polestar", ["polestar"]],
  ["Pontiac", ["pontiac"]], ["Porsche", ["porsche"]], ["RAM", ["ram "]],
  ["Renault", ["renault"]], ["Rivian", ["rivian"]], ["Saab", ["saab"]],
  ["Seat", ["seat "]], ["Skoda", ["skoda", "škoda"]], ["Smart", ["smart "]],
  ["Subaru", ["subaru"]], ["Suzuki", ["suzuki"]], ["Tesla", ["tesla"]],
  ["Toyota", ["toyota"]], ["Volkswagen", ["volkswagen", "vw "]], ["Volvo", ["volvo"]],
  ["BYD", ["byd"]], ["JAC", ["jac "]], ["Zeekr", ["zeekr"]], ["NIO", ["nio "]],
  ["XPeng", ["xpeng"]], ["HiPhi", ["hiphi"]], ["Vinfast", ["vinfast"]],
];

const norm = (s) =>
  (s ?? "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function detectBrand(name) {
  const n = " " + norm(name) + " ";
  for (const [brand, keys] of BRANDS) {
    for (const k of keys) {
      const kn = " " + norm(k) + " ";
      if (n.includes(kn) || n.includes(kn.trim() + " ") || n.startsWith(kn.slice(1))) return brand;
    }
  }
  return null;
}

function stripCommon(text) {
  return text
    .replace(/\bfree\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\(free\s*download\)/gi, "")
    .replace(/\b(19|20)\d{2}\s*[-–—]\s*(19|20)?\d{2,4}\b/g, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\|.*$/, "")
    .replace(/[^\p{L}\p{N} .\-']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractModel(name, brand) {
  let s = stripCommon(name);
  if (brand) {
    for (const [b, keys] of BRANDS) {
      if (b !== brand) continue;
      for (const k of keys) {
        s = s.replace(new RegExp(`\\b${k.trim()}\\b`, "gi"), "");
      }
      s = s.replace(new RegExp(`\\b${b}\\b`, "gi"), "");
    }
  }
  return s.replace(/\s+/g, " ").trim();
}

function extractYears(name) {
  const range = name.match(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)?\d{2,4})\b/);
  if (range) {
    let y1 = Number(range[1]);
    let y2s = range[2];
    let y2 = y2s.length === 2 ? Number(String(y1).slice(0, 2) + y2s) : Number(y2s);
    if (y2 < y1) [y1, y2] = [y2, y1];
    return [y1, y2];
  }
  const single = name.match(/\b((?:19|20)\d{2})\b/);
  if (single) { const y = Number(single[1]); return [y, y]; }
  return [0, 0];
}

function slug(brand, model) {
  const b = norm(brand);
  const m = norm(model).replace(/\s+/g, "-");
  return (b ? b.replace(/\s+/g, "-") + "-" : "") + m;
}

// ------------------------------ execução ------------------------------
const cand = JSON.parse(fs.readFileSync(CAND, "utf8")).candidates;
const cars = JSON.parse(fs.readFileSync(CARS, "utf8")).cars;

const existingSlugs = new Set(cars.map((c) => c.id));
const existingUrls = new Set(cars.map((c) => c.credit.sourceUrl).filter(Boolean));

const enriched = [];
const rejected = { noBrand: [], noModel: [], existingUrl: [], existingSlug: [] };

for (const c of cand) {
  if (existingUrls.has(c.viewerUrl)) { rejected.existingUrl.push(c); continue; }
  const brand = detectBrand(c.name);
  if (!brand) { rejected.noBrand.push(c); continue; }
  const modelRaw = extractModel(c.name, brand);
  if (!modelRaw || modelRaw.length < 2) { rejected.noModel.push(c); continue; }
  // modelo canônico curto: primeira palavra "de peso" (>=2 chars)
  const modelWords = modelRaw.split(" ").filter((w) => w.length >= 2);
  const modelShort = modelWords.slice(0, 2).join(" "); // até 2 palavras
  const id = slug(brand, modelShort);
  if (existingSlugs.has(id)) { rejected.existingSlug.push({ ...c, id }); continue; }
  enriched.push({
    uid: c.uid, name: c.name, id, brand, model: titleCase(modelShort),
    modelRaw, years: extractYears(c.name),
    likeCount: c.likeCount, viewCount: c.viewCount, faceCount: c.faceCount,
    glbBytes: c.glbBytes, license: c.license,
    author: c.author, authorUrl: c.authorUrl, sourceUrl: c.viewerUrl,
  });
}

// dedup interno: mesmo slug → mais likes vence
const bySlug = new Map();
for (const e of enriched) {
  const prev = bySlug.get(e.id);
  if (!prev || e.likeCount > prev.likeCount) bySlug.set(e.id, e);
}
const uniq = [...bySlug.values()];
uniq.sort((a, b) => b.likeCount - a.likeCount);

const plan = uniq.slice(0, TOP);
const totalGB = plan.reduce((s, x) => s + x.glbBytes, 0) / 1e9;

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), top: TOP, count: plan.length, rawGB: +totalGB.toFixed(2), plan }, null, 2));
fs.writeFileSync(REJECT, JSON.stringify({
  counts: {
    total: cand.length,
    noBrand: rejected.noBrand.length,
    noModel: rejected.noModel.length,
    existingUrl: rejected.existingUrl.length,
    existingSlug: rejected.existingSlug.length,
    accepted: enriched.length,
    afterDedup: uniq.length,
    picked: plan.length,
  },
  noBrandSample: rejected.noBrand.slice(0, 20).map((c) => c.name),
  existingSlugSample: rejected.existingSlug.slice(0, 20).map((c) => `${c.id} (${c.name})`),
}, null, 2));

console.log(`recebidos: ${cand.length}`);
console.log(`sem marca detectada: ${rejected.noBrand.length}`);
console.log(`sem modelo extraído: ${rejected.noModel.length}`);
console.log(`bateu URL existente: ${rejected.existingUrl.length}`);
console.log(`bateu slug existente: ${rejected.existingSlug.length}`);
console.log(`aceitos: ${enriched.length}`);
console.log(`após dedup interno (mesmo slug): ${uniq.length}`);
console.log(`plano final (top ${TOP}): ${plan.length} modelos, ${totalGB.toFixed(1)} GB bruto`);
console.log(`\ndistribuição por marca no plano:`);
const byBrand = {};
for (const p of plan) byBrand[p.brand] = (byBrand[p.brand] ?? 0) + 1;
Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([b, n]) => console.log(`  ${b.padEnd(20)} ${n}`));

function titleCase(s) {
  return s.split(" ").map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
