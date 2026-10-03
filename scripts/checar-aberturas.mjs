#!/usr/bin/env node
/**
 * Roda a descoberta de aberturas (demo/aberturas.js) em todo o acervo e aponta
 * o que saiu torto.
 *
 *   node scripts/checar-aberturas.mjs            # todos os .glb de assets/
 *   node scripts/checar-aberturas.mjs vw-tcross  # só os que casam com o filtro
 *   node scripts/checar-aberturas.mjs --csv saida.csv
 *
 * Não decodifica nada do binário: o cabeçalho JSON do .glb já traz a árvore de
 * nós, as transformações e o `min`/`max` de cada accessor de POSITION. Isso é
 * exatamente o que `prepararAberturas` consome — ela só mede caixas
 * envolventes. Então dá para checar os 530 modelos em segundos, sem WebGL,
 * sem decodificar textura e sem abrir o navegador.
 *
 * O que conta como defeito (e por quê):
 *   ENGOLIU   a peça ocupa quase o carro inteiro — a varredura pegou a
 *             carroceria junto, e abrir isso gira o carro todo
 *   ORBITA    ao abrir, o centro da peça anda mais que o próprio tamanho dela:
 *             sinal clássico de pivô no lugar errado
 *   AFUNDA    a peça atravessa o chão ao abrir — eixo ou sentido invertido
 *   PORTAS    mais de seis portas: o agrupamento se perdeu
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { prepararAberturas, posicionarPeca } from "../demo/aberturas.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(raiz, "assets");

/* ----------------------------------------------------------- leitura glb -- */

function cabecalho(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return null;
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}

/* Posição quantizada (KHR_mesh_quantization): 484 dos 530 modelos saem assim do
   nosso próprio pipeline de meshopt. O min/max vem em inteiro normalizado, e
   ler como float dá caixa milhões de vezes maior — era o que fazia o capô
   "afundar" neste checador enquanto no navegador abria certo. */
const ESCALA_NORMALIZADA = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/** Caixa local da malha, pela união do min/max dos accessors de POSITION. */
function caixaDaMalha(json, indice) {
  const malha = json.meshes?.[indice];
  if (!malha) return null;
  const caixa = new THREE.Box3();
  for (const prim of malha.primitives || []) {
    const acc = json.accessors?.[prim.attributes?.POSITION];
    if (!acc?.min || !acc?.max) continue;
    const divisor = acc.normalized ? (ESCALA_NORMALIZADA[acc.componentType] || 1) : 1;
    caixa.union(new THREE.Box3(
      new THREE.Vector3().fromArray(acc.min).divideScalar(divisor),
      new THREE.Vector3().fromArray(acc.max).divideScalar(divisor),
    ));
  }
  return caixa.isEmpty() ? null : caixa;
}

/**
 * Monta a árvore em three.js com uma caixa no lugar de cada malha.
 *
 * A geometria real não importa aqui: `prepararAberturas` só lê nome, hierarquia
 * e caixa envolvente. Uma BoxGeometry do tamanho certo dá o mesmo resultado.
 */
function montarCena(json) {
  const cena = json.scenes?.[json.scene ?? 0];
  if (!cena) return null;

  const feitos = new Map();

  const montar = (i) => {
    if (feitos.has(i)) return feitos.get(i);
    const n = json.nodes[i];
    const o = new THREE.Group();
    o.name = n.name || "";
    if (n.matrix) {
      o.matrixAutoUpdate = false;
      o.matrix.fromArray(n.matrix);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      o.matrixAutoUpdate = true;
    } else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }

    if (n.mesh !== undefined) {
      const c = caixaDaMalha(json, n.mesh);
      if (c) {
        const t = c.getSize(new THREE.Vector3());
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(t.x, 1e-6), Math.max(t.y, 1e-6), Math.max(t.z, 1e-6)),
          new THREE.MeshBasicMaterial(),
        );
        m.position.copy(c.getCenter(new THREE.Vector3()));
        o.add(m);
      }
    }

    feitos.set(i, o);
    for (const f of n.children || []) o.add(montar(f));
    return o;
  };

  const r = new THREE.Group();
  for (const i of cena.nodes || []) r.add(montar(i));
  return r;
}

/* -------------------------------------------------------------- checagem -- */

const caixaDe = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
const volume = (c) => { const t = c.getSize(new THREE.Vector3()); return Math.max(t.x, 1e-9) * Math.max(t.y, 1e-9) * Math.max(t.z, 1e-9); };

function checar(arquivo) {
  const json = cabecalho(arquivo);
  if (!json) return { erro: "não é GLB" };

  const cena = montarCena(json);
  if (!cena) return { erro: "sem cena" };

  const pecas = prepararAberturas(cena);
  if (!pecas.length) return { pecas: [], defeitos: [] };

  const carro = caixaDe(cena);
  const tamCarro = carro.getSize(new THREE.Vector3());
  const comprimentoCarro = Math.max(tamCarro.x, tamCarro.z);
  const volCarro = volume(carro);
  const defeitos = [];

  const portas = pecas.filter((p) => p.tipo === "porta").length;
  if (portas > 6) defeitos.push(`PORTAS(${portas})`);

  for (const p of pecas) {
    const antes = caixaDe(p.pivo).clone();
    const centroAntes = antes.getCenter(new THREE.Vector3());
    const tamPeca = antes.getSize(new THREE.Vector3());

    if (detalhe) {
      const nomes = [];
      p.pivo.traverse((o) => { if (o.name && nomes.length < 4) nomes.push(o.name); });
      const mede = Math.max(tamPeca.x, tamPeca.y, tamPeca.z) / comprimentoCarro;
      console.log(`    ${p.tipo.padEnd(6)} ${(mede * 100).toFixed(0).padStart(3)}% do comprimento   ${nomes.join(" | ")}`);
    }

    const fracao = volume(antes) / volCarro;
    if (fracao > (p.tipo === "porta" ? 0.5 : 0.6)) {
      defeitos.push(`ENGOLIU:${p.tipo}(${(fracao * 100).toFixed(0)}%)`);
      continue;
    }

    const d = p.pivo.userData.dobradica;
    posicionarPeca(p.pivo, d.aberto);
    const depois = caixaDe(p.pivo);
    const centroDepois = depois.getCenter(new THREE.Vector3());
    posicionarPeca(p.pivo, 0);

    /* Girar pela própria aresta move o centro, no máximo, o tamanho da peça.
       Muito além disso é pivô longe da peça — a porta orbitando o carro. */
    const andou = centroAntes.distanceTo(centroDepois);
    const limite = Math.max(tamPeca.x, tamPeca.y, tamPeca.z) * 1.1;
    if (andou > limite) defeitos.push(`ORBITA:${p.tipo}(${(andou / comprimentoCarro * 100).toFixed(0)}% do carro)`);

    const folga = tamCarro.y * 0.05;
    if (depois.min.y < carro.min.y - folga) defeitos.push(`AFUNDA:${p.tipo}`);
  }

  return { pecas, defeitos };
}

/* ------------------------------------------------------------------ saída -- */

const args = process.argv.slice(2);
const iCsv = args.indexOf("--csv");
const csv = iCsv >= 0 ? args[iCsv + 1] : null;
const detalhe = args.includes("--detalhe");
const filtro = args.filter((a) => a !== "--detalhe").filter((_, i) => iCsv < 0 || (i !== iCsv && i !== iCsv + 1))[0] || "";

const arquivos = fs.readdirSync(assets)
  .filter((f) => f.endsWith(".glb") && (!filtro || f.includes(filtro)))
  .sort();

let comPecas = 0;
let comDefeito = 0;
const linhas = [];
const porDefeito = new Map();

for (const f of arquivos) {
  let r;
  try { r = checar(path.join(assets, f)); } catch (e) { r = { erro: e.message }; }

  if (r.erro) { console.log(`  ! ${f.padEnd(36)} ${r.erro}`); continue; }
  if (!r.pecas.length) { linhas.push(`${f},0,,`); continue; }

  comPecas++;
  const conta = r.pecas.reduce((c, p) => ({ ...c, [p.tipo]: (c[p.tipo] || 0) + 1 }), {});
  const resumo = Object.entries(conta).map(([t, n]) => `${n} ${t}`).join(" + ");

  if (r.defeitos.length) {
    comDefeito++;
    for (const d of r.defeitos) {
      const chave = d.split(/[:(]/)[0];
      porDefeito.set(chave, (porDefeito.get(chave) || 0) + 1);
    }
    console.log(`  ✗ ${f.padEnd(36)} ${resumo.padEnd(26)} ${[...new Set(r.defeitos)].join(" ")}`);
  } else if (filtro) {
    console.log(`  ✓ ${f.padEnd(36)} ${resumo}`);
  }

  linhas.push(`${f},${r.pecas.length},"${resumo}","${r.defeitos.join(" ")}"`);
}

console.log(`\n${arquivos.length} modelos · ${comPecas} com peça que abre · ${comDefeito} com defeito`);
if (porDefeito.size) {
  console.log("defeitos:", [...porDefeito].map(([k, n]) => `${k}=${n}`).join("  "));
}
if (csv) {
  fs.writeFileSync(csv, "arquivo,pecas,resumo,defeitos\n" + linhas.join("\n"));
  console.log(`csv: ${csv}`);
}
process.exit(comDefeito ? 1 : 0);
