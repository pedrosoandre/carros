#!/usr/bin/env node
/**
 * Verifica a integridade da biblioteca antes de publicar.
 *
 * Numa biblioteca pública o manifesto não pode divergir dos arquivos: alguém
 * vai carregar `cars.json`, pedir um `.glb` que não existe, e receber 404 — ou
 * pior, tentar repintar um material que não está no arquivo e não entender por
 * que nada acontece. Este script falha se qualquer uma dessas coisas for verdade.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(raiz, "assets");
const manifest = JSON.parse(fs.readFileSync(path.join(raiz, "cars.json"), "utf8"));

const erros = [];
const avisos = [];

/** Lê os nomes de material do chunk JSON de um .glb, sem dependências. */
function materiaisDo(arquivo) {
  const buf = fs.readFileSync(arquivo);
  if (buf.length < 20 || buf.toString("utf8", 0, 4) !== "glTF") return null;
  const len = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + len));
  return new Set((gltf.materials ?? []).map((m) => m.name));
}

const noDisco = new Set(fs.readdirSync(assets).filter((f) => f.endsWith(".glb")));
const noManifesto = new Set();
const ids = new Set();

for (const car of manifest.cars) {
  // 1) id único
  if (ids.has(car.id)) erros.push(`id duplicado: ${car.id}`);
  ids.add(car.id);

  // 2) o arquivo existe
  const arquivo = path.join(assets, car.file);
  noManifesto.add(car.file);
  if (!noDisco.has(car.file)) {
    erros.push(`${car.id}: arquivo ausente em assets/ (${car.file})`);
    continue;
  }

  // 3) é um GLB válido
  const mats = materiaisDo(arquivo);
  if (mats === null) {
    erros.push(`${car.id}: não é um GLB válido`);
    continue;
  }

  // 4) o tamanho registrado bate com o real
  const real = fs.statSync(arquivo).size;
  if (real !== car.bytes) {
    avisos.push(`${car.id}: bytes desatualizado (manifesto ${car.bytes}, real ${real}) — rode build:data`);
  }

  // 5) os materiais de pintura existem de fato no arquivo
  if (car.paint) {
    for (const m of car.paint.materials) {
      if (!mats.has(m)) erros.push(`${car.id}: material de pintura "${m}" não existe no arquivo`);
    }
  }

  // 6) crédito obrigatório — CC BY sem autor é violação de licença
  if (!car.credit?.author || car.credit.author === "desconhecido") {
    erros.push(`${car.id}: sem autor no crédito (obrigatório por CC BY)`);
  }
  if (/NonCommercial|NoDerivs/i.test(car.credit?.license ?? "")) {
    erros.push(`${car.id}: licença ${car.credit.license} não permite o uso pretendido`);
  }
}

// 7) arquivos órfãos: estão em assets/ mas ninguém referencia
for (const f of noDisco) {
  if (!noManifesto.has(f)) avisos.push(`${f}: em assets/ mas fora do manifesto`);
}

// 8) contagem declarada
if (manifest.count !== manifest.cars.length) {
  erros.push(`count declarado (${manifest.count}) != carros no manifesto (${manifest.cars.length})`);
}

const comPintura = manifest.cars.filter((c) => c.paint).length;
console.log(`carros no manifesto: ${manifest.cars.length}`);
console.log(`arquivos em assets/: ${noDisco.size}`);
console.log(`com alvo de pintura: ${comPintura} (${manifest.cars.length - comPintura} sem)`);
console.log(`tamanho total: ${(manifest.totalBytes / 1048576).toFixed(0)} MB`);

if (avisos.length) {
  console.log(`\navisos (${avisos.length}):`);
  avisos.slice(0, 20).forEach((a) => console.log(`  - ${a}`));
  if (avisos.length > 20) console.log(`  ... e mais ${avisos.length - 20}`);
}

if (erros.length) {
  console.error(`\nERROS (${erros.length}):`);
  erros.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

console.log("\n✓ biblioteca íntegra");
