#!/usr/bin/env node
/**
 * Monta os assets da demo em demo/models/ e o catálogo em demo/catalog.json.
 *
 * A demo não usa o catálogo inteiro de propósito: 2,1 GB não cabem no GitHub
 * Pages (limite de 1 GB por site) e ninguém espera meia hora de download para
 * ver um carro girar. O recorte abaixo é curado para contar a história —
 * nacional antigo, popular moderno, premium, chinês — e inclui de propósito
 * dois carros com `paint: null`, porque esconder que 40% do catálogo não é
 * repintável seria vender o que a biblioteca não entrega.
 *
 * demo/models/ é gerado, não versionado. Rode este script antes de publicar.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(raiz, "assets");
const destino = path.join(raiz, "demo", "models");

const CARROS = [
  // nacionais e clássicos de rua brasileira
  "chevrolet-opala", "chevrolet-chevette", "volkswagen-gol", "fiat-uno",
  "fiat-147", "volkswagen-fusca", "vw-kombi", "ford-corcel", "chevrolet-corsa",
  // populares e SUVs do pátio de hoje
  "chevrolet-onix", "fiat-toro", "vw-tcross", "jeep-renegade", "ford-ka",
  "chevrolet-celta", "honda-civic", "toyota-corolla", "vw-saveiro", "chevrolet-s10",
  // premium e esportivo
  "porsche-911", "bmw-m3-e30",
  // chineses
  "byd-seal", "byd-dolphin",
];

// Cenários são um caso à parte: cada autor modela numa escala própria (ver a
// ressalva sobre bbox no README), então não dá para pegar qualquer um. Estes
// três são salas de verdade — não props soltos como macaco ou prateleira — e o
// viewer normaliza cada um pela bounding box medida no arquivo carregado.
const CENARIOS = [
  "rick-and-morty-garage",
  "garage-old-industrial-building",
  "garage-brutalist-interior",
];

const cars = JSON.parse(fs.readFileSync(path.join(raiz, "cars.json"), "utf8")).cars;
const scenery = JSON.parse(fs.readFileSync(path.join(raiz, "scenery.json"), "utf8")).scenery;

const pegar = (lista, ids, rotulo) =>
  ids.map((id) => {
    const item = lista.find((x) => x.id === id);
    if (!item) throw new Error(`${rotulo} "${id}" não existe no manifesto`);
    return item;
  });

const carrosSel = pegar(cars, CARROS, "carro");
const cenariosSel = pegar(scenery, CENARIOS, "cenário");

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(path.join(destino, "scenery"), { recursive: true });

let bytes = 0;
for (const item of [...carrosSel, ...cenariosSel]) {
  const origem = path.join(assets, item.file);
  if (!fs.existsSync(origem)) throw new Error(`arquivo ausente: ${item.file}`);
  fs.copyFileSync(origem, path.join(destino, item.file));
  bytes += item.bytes;
}

// O catálogo da demo carrega só os campos que o viewer usa. Os créditos vão
// junto porque a CC BY obriga quem exibe — a demo exibe, logo a demo credita.
const catalogo = {
  geradoEm: new Date().toISOString().slice(0, 10),
  totalNoCatalogo: cars.length,
  cars: carrosSel.map((c) => ({
    id: c.id, brand: c.brand, model: c.model, years: c.years,
    category: c.category, file: c.file, bytes: c.bytes,
    paint: c.paint, credit: c.credit,
  })),
  scenery: cenariosSel.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, file: s.file,
    bytes: s.bytes, bbox: s.bbox, credit: s.credit,
  })),
};

fs.writeFileSync(path.join(raiz, "demo", "catalog.json"), JSON.stringify(catalogo, null, 2));

const comPaint = carrosSel.filter((c) => c.paint).length;
console.log(
  `demo/models/ — ${carrosSel.length} carros (${comPaint} repintáveis) + ` +
    `${cenariosSel.length} cenários, ${(bytes / 1048576).toFixed(1)} MB`,
);
