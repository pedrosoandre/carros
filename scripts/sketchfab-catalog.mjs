/**
 * Fase 5 — Metadados + merge no cars.json.
 *
 * Junta o plano (marca/modelo/anos/créditos) com os arquivos processados
 * (Fase 4), infere categoria via heurística de palavras, aplica detecção
 * simples de paint materials (por nome do material), e regenera:
 *   - `cars.json` (versão bump para 1.1.0)
 *   - `CREDITS.md`
 *
 * A detecção geométrica de pintura (bbox × rodas) fica para uma fase
 * posterior — aqui usamos só a lista de nomes inequívocos. Modelos sem
 * match ficam com paint: null (é aceitável, README já cobre).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = path.join(ROOT, "scratch", "download-plan.json");
const PROC = path.join(ROOT, "scratch", "processed.json");
const CARS = path.join(ROOT, "cars.json");
const CREDITS = path.join(ROOT, "CREDITS.md");

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

// ---- categoria por palavras-chave no nome ----
const CATEGORY_KEYWORDS = [
  ["sports", ["gt3", "gt2", "gt-r", "gtr", "supercar", "hypercar", "spyder", "roadster", "sport", "motorsport", "racing", "race car", "f8", "huracan", "aventador", "chiron", "veyron", "gt500", "carrera", "911"]],
  ["coupe", ["coupe", "coupé", "convertible", "cabrio", "cabriolet"]],
  ["pickup", ["pickup", "pick-up", "silverado", "f-150", "ranger", "hilux", "tacoma", "ram 1500", "ram 2500", "s10"]],
  ["suv", ["suv", "range rover", "wrangler", "grand cherokee", "escalade", "explorer", "tahoe", "expedition", "cayenne", "macan", "urus", "bentayga", "dbx", "cullinan"]],
  ["van", ["van", "sprinter", "transit", "ducato", "trafic", "vito", "hiace"]],
  ["minivan", ["minivan", "sienna", "odyssey", "carnival", "sedona"]],
  ["wagon", ["wagon", "estate", "touring", "avant", "variant", "sw ", " sw"]],
  ["hatchback", ["hatchback", "hatch"]],
  ["sedan", ["sedan", "sedã", "berlina"]],
  ["utility", ["utility", "utilitário"]],
];

function inferCategory(name, tags = []) {
  const n = (name + " " + tags.join(" ")).toLowerCase();
  for (const [cat, keys] of CATEGORY_KEYWORDS) {
    if (keys.some((k) => n.includes(k))) return cat;
  }
  return "coupe"; // default seguro para carros exóticos/luxo (perfil dominante)
}

// ---- detecção de paint materials por nome (heurística conservadora) ----
const PAINT_PATTERNS = [
  /^carpaint$/i, /^car[_-]?paint$/i, /^paint$/i, /^pintura$/i,
  /^body[_-]?paint$/i, /^bodypaint$/i, /^kuzov$/i,
  /^car[_-]?body$/i, /^body$/i, /^lataria$/i, /^exterior$/i, /^main[_-]?paint$/i,
];

async function detectPaint(glbPath) {
  try {
    const doc = await io.read(glbPath);
    const materials = doc.getRoot().listMaterials();
    const matches = materials
      .map((m) => m.getName())
      .filter((n) => n && PAINT_PATTERNS.some((re) => re.test(n)));
    if (matches.length === 0) return null;
    return { materials: matches, textured: false, confidence: "média" };
  } catch { return null; }
}

// -------------------- execução --------------------
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).plan;
const proc = JSON.parse(fs.readFileSync(PROC, "utf8"));
const catalog = JSON.parse(fs.readFileSync(CARS, "utf8"));

const planByUid = new Map(plan.map((p) => [p.uid, p]));
const newCars = [];
for (const [uid, info] of Object.entries(proc.ok)) {
  const p = planByUid.get(uid);
  if (!p) continue;
  const glb = path.join(ROOT, "assets", info.file);
  const paint = await detectPaint(glb);
  const category = inferCategory(p.name, []);
  newCars.push({
    id: p.id,
    brand: p.brand,
    model: p.model,
    years: p.years && p.years[0] > 0 ? p.years : [0, 0],
    category,
    file: info.file,
    bytes: info.bytes,
    paint,
    credit: {
      author: p.author,
      authorUrl: p.authorUrl,
      license: p.license,
      sourceName: p.name,
      sourceUrl: p.sourceUrl,
    },
  });
}

// merge com o catálogo atual — evita colisão de id
const currentById = new Map(catalog.cars.map((c) => [c.id, c]));
let added = 0, replaced = 0;
for (const nc of newCars) {
  if (currentById.has(nc.id)) { replaced++; continue; } // conservador: não sobrescreve
  currentById.set(nc.id, nc);
  added++;
}

// ordena: Genérico por último, depois marca/modelo alfabético pt-BR
const merged = [...currentById.values()].sort((a, b) => {
  const ag = a.brand === "Genérico" ? 1 : 0;
  const bg = b.brand === "Genérico" ? 1 : 0;
  if (ag !== bg) return ag - bg;
  return a.brand.localeCompare(b.brand, "pt-BR") || a.model.localeCompare(b.model, "pt-BR");
});

const totalBytes = merged.reduce((s, c) => s + c.bytes, 0);
const brands = [...new Set(merged.map((c) => c.brand))];
const categories = [...new Set(merged.map((c) => c.category))];

const nextManifest = {
  ...catalog,
  version: "1.1.0",
  count: merged.length,
  totalBytes,
  brands,
  categories,
  cars: merged,
};
fs.writeFileSync(CARS, JSON.stringify(nextManifest, null, 2));

// ---- CREDITS.md ----
const creditsHeader = `# Créditos dos modelos 3D

${merged.length} modelos, ${(totalBytes / 1048576).toFixed(1)} MB no total. Todos baixados do [Sketchfab](https://sketchfab.com)
via API, filtrados para licenças que **permitem uso comercial**.

## Obrigação legal

Todos os modelos são **CC Attribution (CC BY)** ou **CC Attribution-ShareAlike (CC BY-SA)**:
permitem uso comercial, mas exigem que o autor seja creditado sempre que o modelo for exibido
publicamente. Mantenha esta lista acessível no produto — por exemplo numa página "Sobre" ou "Créditos".

Nenhum modelo tem cláusula NonCommercial ou NoDerivs.

## Atribuições

| Obra original | Autor | Licença | Arquivos |
|---|---|---|---|
`;

const rows = merged
  .filter((c) => c.credit?.sourceUrl)
  .map((c) => {
    const name = (c.credit.sourceName ?? c.model).replace(/\|/g, "\\|");
    const author = (c.credit.author ?? "desconhecido").replace(/\|/g, "\\|");
    const license = c.credit.license ?? "CC Attribution";
    return `| [${name}](${c.credit.sourceUrl}) | ${author} | ${license} | \`${c.file}\` |`;
  })
  .join("\n");

fs.writeFileSync(CREDITS, creditsHeader + rows + "\n");

console.log(`novos: ${added}, ignorados (id existia): ${replaced}`);
console.log(`total no catálogo: ${merged.length} modelos, ${(totalBytes / 1048576).toFixed(0)} MB`);
console.log(`marcas: ${brands.length}`);
console.log(`cars.json v${nextManifest.version} + CREDITS.md gravados`);
