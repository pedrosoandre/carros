#!/usr/bin/env node
/**
 * Copia os .glb da biblioteca para a pasta pública do projeto que a consome.
 *
 * Os modelos não vão no tarball do npm (são ~2,1 GB; ninguém quer isso em
 * node_modules de todo projeto). Então este comando é a ponte: pega os arquivos
 * de onde a biblioteca estiver instalada e põe onde o seu servidor web serve.
 *
 *   npx carros-assets public/cars
 *   npx carros-assets public/cars --only=fiat-uno,chevrolet-onix
 *   npx carros-assets public/cars --brand=Fiat,Chevrolet
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raizPacote = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(raizPacote, "assets");
const manifestPath = path.join(raizPacote, "cars.json");
const sceneryManifestPath = path.join(raizPacote, "scenery.json");

const args = process.argv.slice(2);
const destino = args.find((a) => !a.startsWith("--"));
const flag = (nome) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const somente = flag("only");
const marcas = flag("brand");
const categorias = flag("category");
const kinds = flag("kind");
// por padrão copia carros + scenery. --scenery-only pula carros; --no-scenery pula scenery.
const sceneryOnly = args.includes("--scenery-only");
const noScenery = args.includes("--no-scenery");

if (!destino || args.includes("--help") || args.includes("-h")) {
  console.log(`
carros-assets — copia os modelos .glb para a pasta pública do seu projeto

  npx carros-assets <destino> [opções]

Opções
  --only=id1,id2         copia apenas estes modelos (id = nome do arquivo sem .glb)
  --brand=Fiat,Ford      copia apenas destas marcas
  --category=suv,sedan   copia apenas destas categorias
  --kind=garage,workshop copia apenas cenários destes tipos
  --scenery-only         copia apenas cenários (pula carros)
  --no-scenery           copia apenas carros (pula cenários)
  --force                sobrescreve arquivos já existentes no destino

Exemplos
  npx carros-assets public/cars
  npx carros-assets public/cars --brand=Fiat,Chevrolet,Volkswagen
  npx carros-assets public/cars --category=suv,pickup
  npx carros-assets public/cars --scenery-only --kind=garage,workshop
`);
  process.exit(destino ? 0 : 1);
}

if (!fs.existsSync(assets)) {
  console.error(`
Os modelos .glb não estão presentes em:
  ${assets}

Isso acontece quando a biblioteca é instalada pelo npm/git: o tarball não
inclui os ~2,1 GB de assets de propósito.

Para obtê-los, clone o repositório e instale por caminho local:

  git clone https://github.com/pedrosoandre/carros.git
  npm install ./carros
  npx carros-assets public/cars
`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sceneryManifest = fs.existsSync(sceneryManifestPath)
  ? JSON.parse(fs.readFileSync(sceneryManifestPath, "utf8"))
  : { scenery: [] };

let carrosSel = sceneryOnly ? [] : manifest.cars;
if (somente) carrosSel = carrosSel.filter((c) => somente.includes(c.id));
if (marcas) {
  const alvo = marcas.map((b) => b.toLowerCase());
  carrosSel = carrosSel.filter((c) => alvo.includes(c.brand.toLowerCase()));
}
if (categorias) carrosSel = carrosSel.filter((c) => categorias.includes(c.category));

let scenerySel = noScenery ? [] : (sceneryManifest.scenery ?? []);
if (somente) scenerySel = scenerySel.filter((s) => somente.includes(s.id));
if (kinds) scenerySel = scenerySel.filter((s) => kinds.includes(s.kind));

if (carrosSel.length === 0 && scenerySel.length === 0) {
  console.error("Nenhum modelo corresponde ao filtro. Use --help para ver as opções.");
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });

let copiados = 0;
let pulados = 0;
let bytes = 0;
const ausentes = [];

const copiarUm = (relFile) => {
  const origem = path.join(assets, relFile);
  const alvo = path.join(destino, relFile);
  if (!fs.existsSync(origem)) { ausentes.push(relFile); return; }
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  if (fs.existsSync(alvo) && !args.includes("--force")) { pulados++; return; }
  fs.copyFileSync(origem, alvo);
  bytes += fs.statSync(alvo).size;
  copiados++;
};

for (const car of carrosSel) copiarUm(car.file);
for (const scn of scenerySel) copiarUm(scn.file);

// Os créditos vão junto: CC BY exige atribuição de quem exibe o modelo.
const creditos = path.join(destino, "CREDITS.md");
if (!fs.existsSync(creditos) || args.includes("--force")) {
  fs.copyFileSync(path.join(raizPacote, "CREDITS.md"), creditos);
}

const resumoTipo = `${carrosSel.length} carros + ${scenerySel.length} cenários`;
console.log(`${copiados} arquivos copiados para ${destino} (${resumoTipo}, ${(bytes / 1048576).toFixed(0)} MB)`);
if (pulados) console.log(`${pulados} já existiam (use --force para sobrescrever)`);
if (ausentes.length) console.log(`ATENÇÃO: ${ausentes.length} arquivos não encontrados: ${ausentes.slice(0, 5).join(", ")}${ausentes.length > 5 ? "…" : ""}`);
console.log(`CREDITS.md copiado — a licença CC BY exige creditar os autores no seu produto.`);
