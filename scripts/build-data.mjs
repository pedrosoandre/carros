#!/usr/bin/env node
/**
 * Gera src/generated/manifests.ts a partir de cars.json e scenery.json.
 *
 * Por que este passo existe: importar JSON direto do TypeScript faz o tsc
 * emitir `import manifest from "../cars.json"` no dist, e isso quebra em dois
 * lugares — no Node ESM puro (ERR_IMPORT_ATTRIBUTE_MISSING, porque falta
 * `with { type: "json" }`) e em bundlers anteriores ao suporte a import
 * attributes. Embutir os dados num módulo .ts normal funciona em qualquer
 * runtime e qualquer bundler, sem ressalva de versão.
 *
 * Os dados vão como string para JSON.parse, e não como literal de objeto, de
 * propósito: o parse de uma string é mais rápido que o de um literal
 * equivalente desse tamanho, e mantém o arquivo gerado com AST trivial (o tsc
 * não precisa inferir tipo de 530 objetos).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "src", "generated");

const cars = JSON.parse(fs.readFileSync(path.join(raiz, "cars.json"), "utf8"));
const scenery = JSON.parse(fs.readFileSync(path.join(raiz, "scenery.json"), "utf8"));

// JSON.stringify duas vezes: a primeira serializa os dados, a segunda os
// transforma num literal de string JS corretamente escapado.
const literal = (dados) => JSON.stringify(JSON.stringify(dados));

const conteudo = `// Gerado por scripts/build-data.mjs — não edite à mão.
// Fonte: cars.json (${cars.cars.length} carros) e scenery.json (${scenery.scenery.length} cenários).
// Os tipos reais (Car, SceneryItem) são aplicados em src/index.ts.

export interface CarsManifest {
  version: string;
  brands: string[];
  cars: unknown[];
}

export interface SceneryManifest {
  kinds?: unknown[];
  scenery: unknown[];
}

export const carsManifest = JSON.parse(
  ${literal(cars)},
) as CarsManifest;

export const sceneryManifest = JSON.parse(
  ${literal(scenery)},
) as SceneryManifest;
`;

fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, "manifests.ts"), conteudo);

console.log(
  `src/generated/manifests.ts — ${cars.cars.length} carros, ${scenery.scenery.length} cenários ` +
    `(${(Buffer.byteLength(conteudo) / 1024).toFixed(0)} KB)`,
);
