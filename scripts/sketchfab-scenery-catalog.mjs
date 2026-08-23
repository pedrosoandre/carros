/**
 * Fase 5 (scenery) — Metadados + merge em scenery.json + CREDITS.md.
 *
 * Junta o plano (nome, kind, créditos) com os arquivos processados
 * em `assets/scenery/*.glb`. Mede a bounding box de cada arquivo, que é
 * um dado crítico para o consumidor (precisa saber o tamanho do cenário
 * para posicionar câmera e carro dentro).
 *
 * Regenera:
 *   - `scenery.json`
 *   - `CREDITS.md` (mesclado: carros + scenery)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = path.join(ROOT, "scratch", "scenery-plan.json");
const PROC = path.join(ROOT, "scratch", "scenery-processed.json");
const CARS = path.join(ROOT, "cars.json");
const SCENERY = path.join(ROOT, "scenery.json");
const ASSETS_SCENERY = path.join(ROOT, "assets", "scenery");
const RAW_SCENERY = path.join(ROOT, "scratch", "scenery-raw");
const CREDITS = path.join(ROOT, "CREDITS.md");

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

async function measureBbox(glbPath) {
  const doc = await io.read(glbPath);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        for (let a = 0; a < 3; a++) {
          if (arr[i + a] < min[a]) min[a] = arr[i + a];
          if (arr[i + a] > max[a]) max[a] = arr[i + a];
        }
      }
    }
  }
  if (!isFinite(min[0])) return null;
  const round = (n) => +n.toFixed(3);
  return {
    min: min.map(round),
    max: max.map(round),
    dimensions: { x: round(max[0] - min[0]), y: round(max[1] - min[1]), z: round(max[2] - min[2]) },
  };
}

// -------------------- execução --------------------
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).plan;
const proc = JSON.parse(fs.readFileSync(PROC, "utf8"));

const planByUid = new Map(plan.map((p) => [p.uid, p]));
const newScenery = [];
for (const [uid, info] of Object.entries(proc.ok)) {
  const p = planByUid.get(uid);
  if (!p) continue;
  // Bbox precisa ser medida no arquivo RAW: o processado tem POSITION quantizada
  // pelo meshopt em int16, o que retornaria dimensões falsas (±32767).
  const rawGlb = path.join(RAW_SCENERY, `${uid}.glb`);
  const bbox = fs.existsSync(rawGlb) ? await measureBbox(rawGlb) : null;
  newScenery.push({
    id: p.id,
    name: p.name,
    kind: p.kind,
    file: `scenery/${path.basename(info.file)}`,
    bytes: info.bytes,
    bbox,
    credit: {
      author: p.author,
      authorUrl: p.authorUrl,
      license: p.license,
      sourceName: p.sourceName,
      sourceUrl: p.sourceUrl,
    },
  });
}

// merge com scenery.json atual — conservador: não sobrescreve id existente
const currentSceneryManifest = fs.existsSync(SCENERY)
  ? JSON.parse(fs.readFileSync(SCENERY, "utf8"))
  : { name: "carros / scenery", description: "Cenários 3D — garagens, oficinas, showrooms.", version: "0.1.0", count: 0, totalBytes: 0, kinds: [], scenery: [] };

const currentById = new Map((currentSceneryManifest.scenery ?? []).map((s) => [s.id, s]));
let added = 0, kept = 0;
for (const ns of newScenery) {
  if (currentById.has(ns.id)) { kept++; continue; }
  currentById.set(ns.id, ns);
  added++;
}

const merged = [...currentById.values()].sort((a, b) => {
  const k = a.kind.localeCompare(b.kind, "pt-BR");
  return k !== 0 ? k : a.name.localeCompare(b.name, "pt-BR");
});

const totalBytes = merged.reduce((s, x) => s + x.bytes, 0);
const kinds = [...new Set(merged.map((s) => s.kind))].sort();

const nextManifest = {
  ...currentSceneryManifest,
  version: currentSceneryManifest.version ?? "0.1.0",
  count: merged.length,
  totalBytes,
  kinds,
  scenery: merged,
};
fs.writeFileSync(SCENERY, JSON.stringify(nextManifest, null, 2));

// ---- CREDITS.md mesclado (carros + scenery) ----
const cars = JSON.parse(fs.readFileSync(CARS, "utf8")).cars;
const totalItems = cars.length + merged.length;
const totalMB = ((cars.reduce((s, c) => s + c.bytes, 0) + totalBytes) / 1048576).toFixed(1);

const header = `# Créditos dos modelos 3D

${totalItems} itens (${cars.length} carros + ${merged.length} cenários), ${totalMB} MB no total.
Todos baixados do [Sketchfab](https://sketchfab.com) via API, filtrados para licenças que
**permitem uso comercial**.

## Obrigação legal

Todos os modelos são **CC Attribution (CC BY)** ou **CC Attribution-ShareAlike (CC BY-SA)**:
permitem uso comercial, mas exigem que o autor seja creditado sempre que o modelo for exibido
publicamente. Mantenha esta lista acessível no produto — por exemplo numa página "Sobre" ou "Créditos".

Nenhum modelo tem cláusula NonCommercial ou NoDerivs.

## Atribuições — carros

| Obra original | Autor | Licença | Arquivos |
|---|---|---|---|
`;

const carRows = cars
  .filter((c) => c.credit?.sourceUrl)
  .map((c) => {
    const name = (c.credit.sourceName ?? c.model).replace(/\|/g, "\\|");
    const author = (c.credit.author ?? "desconhecido").replace(/\|/g, "\\|");
    const license = c.credit.license ?? "CC Attribution";
    return `| [${name}](${c.credit.sourceUrl}) | ${author} | ${license} | \`${c.file}\` |`;
  })
  .join("\n");

const sceneryHeader = `\n\n## Atribuições — cenários (garagens, oficinas, showrooms)

| Obra original | Autor | Licença | Arquivos |
|---|---|---|---|
`;

const sceneryRows = merged
  .filter((s) => s.credit?.sourceUrl)
  .map((s) => {
    const name = (s.credit.sourceName ?? s.name).replace(/\|/g, "\\|");
    const author = (s.credit.author ?? "desconhecido").replace(/\|/g, "\\|");
    const license = s.credit.license ?? "CC Attribution";
    return `| [${name}](${s.credit.sourceUrl}) | ${author} | ${license} | \`${s.file}\` |`;
  })
  .join("\n");

fs.writeFileSync(CREDITS, header + carRows + sceneryHeader + sceneryRows + "\n");

console.log(`novos cenários: ${added}, ignorados (id existia): ${kept}`);
console.log(`total no scenery.json: ${merged.length}, ${(totalBytes / 1048576).toFixed(1)} MB`);
console.log(`kinds: ${kinds.join(", ")}`);
console.log(`CREDITS.md regenerado (${cars.length} carros + ${merged.length} cenários)`);
