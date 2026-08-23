/**
 * Viewer da demo. Carrega o catálogo recortado (catalog.json), mostra um carro
 * por vez e repinta a lataria usando o campo `paint` do manifesto.
 *
 * O ponto da demo é o repaint: sem o mapa `paint.materials`, trocar a cor de um
 * .glb qualquer significa ou pintar tudo (rodas e vidros junto) ou caçar o nome
 * do material na mão, arquivo por arquivo.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Comprimento alvo do carro em unidades de cena — normaliza escalas de autor. */
const COMPRIMENTO_ALVO = 4.4;
/** Largura alvo da sala. Cenários vêm em metros, centímetros ou escala arbitrária. */
const LARGURA_CENARIO = 15;

const CORES = [
  { nome: "Vermelho", hex: "#b01f24" },
  { nome: "Preto", hex: "#15171a" },
  { nome: "Branco", hex: "#e8e8e6" },
  { nome: "Prata", hex: "#9aa0a6" },
  { nome: "Azul", hex: "#1f4e9c" },
  { nome: "Verde", hex: "#1d5c3f" },
  { nome: "Amarelo", hex: "#e0a80d" },
  { nome: "Laranja", hex: "#d1601a" },
];

/* ------------------------------------------------------------------ cena  */

const host = document.getElementById("canvas-host");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0d0f12");

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
camera.position.set(5.2, 2.1, 6.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 26;
// Trava um pouco acima do chão: por baixo do carro não há nada para ver, e a
// maioria dos modelos não tem assoalho modelado.
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.addEventListener("start", () => { controls.autoRotate = false; });

// RoomEnvironment dá as reflexões que fazem pintura automotiva parecer pintura
// automotiva. Sem env map, metallic vira cinza chapado.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const luzChave = new THREE.DirectionalLight(0xffffff, 2.1);
luzChave.position.set(4.5, 7.5, 3.5);
luzChave.castShadow = true;
luzChave.shadow.mapSize.set(2048, 2048);
luzChave.shadow.bias = -0.0008;
luzChave.shadow.normalBias = 0.02;
const sombra = luzChave.shadow.camera;
sombra.left = -7; sombra.right = 7; sombra.top = 7; sombra.bottom = -7; sombra.far = 25;
scene.add(luzChave);

scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x1a1c20, 0.55));

/** Chão só de sombra: aparece no modo estúdio, some quando entra um cenário. */
const chao = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.42 }),
);
chao.rotation.x = -Math.PI / 2;
chao.receiveShadow = true;
scene.add(chao);

const grade = new THREE.GridHelper(60, 60, 0x2a2f37, 0x1a1e24);
grade.material.transparent = true;
grade.material.opacity = 0.5;
scene.add(grade);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/* ------------------------------------------------------------- utilitários */

const $ = (id) => document.getElementById(id);

const tamanho = new THREE.Vector2();

/**
 * Ajustado a cada quadro, e não por ResizeObserver: o observer não dispara em
 * aba de fundo ou em painel ainda não exibido, e aí o canvas fica preso nos
 * 300x150 padrão. Comparar dois inteiros por quadro é mais barato que o bug.
 */
function ajustarTamanho() {
  const { clientWidth: w, clientHeight: h } = host;
  if (!w || !h) return;
  renderer.getSize(tamanho);
  if (tamanho.x === w && tamanho.y === h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function carregando(ativo, texto = "carregando…") {
  $("carregando").hidden = !ativo;
  $("carregando-texto").textContent = texto;
}

/** Escala o objeto para um tamanho alvo e apoia sua base em y=0, centrado. */
function assentar(objeto, alvo, eixo) {
  const caixa = new THREE.Box3().setFromObject(objeto);
  const tam = caixa.getSize(new THREE.Vector3());
  const medida = eixo === "horizontal" ? Math.max(tam.x, tam.z) : Math.max(tam.x, tam.y, tam.z);
  if (!medida || !isFinite(medida)) return;

  objeto.scale.multiplyScalar(alvo / medida);

  const depois = new THREE.Box3().setFromObject(objeto);
  const centro = depois.getCenter(new THREE.Vector3());
  objeto.position.x -= centro.x;
  objeto.position.z -= centro.z;
  objeto.position.y -= depois.min.y;
}

/* -------------------------------------------------------------- pintura   */

/** Guarda a cor de fábrica de cada material de lataria, por id de carro. */
const coresOriginais = new Map();

function materiaisDeLataria(raiz, alvo) {
  const achados = [];
  raiz.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) if (m && alvo.includes(m.name)) achados.push(m);
  });
  return achados;
}

function repintar(hex) {
  if (!atual || !atual.car.paint) return;
  for (const m of materiaisDeLataria(atual.raiz, atual.car.paint.materials)) {
    m.color.setStyle(hex);
    // Textura de lataria multiplica pela cor: sem clarear um pouco, qualquer
    // tom escuro vira preto. É o caso do campo `textured` no manifesto.
    if (atual.car.paint.textured) m.color.multiplyScalar(1.35);
    m.needsUpdate = true;
  }
}

function limparSelecaoDeCor() {
  document.querySelectorAll(".cores button[aria-pressed]").forEach((b) =>
    b.setAttribute("aria-pressed", "false"),
  );
}

function restaurarCor() {
  if (!atual || !atual.car.paint) return;
  const originais = coresOriginais.get(atual.car.id);
  if (!originais) return;
  materiaisDeLataria(atual.raiz, atual.car.paint.materials).forEach((m, i) => {
    if (originais[i]) m.color.copy(originais[i]);
    m.needsUpdate = true;
  });
  limparSelecaoDeCor();
}

/* --------------------------------------------------------------- catálogo */

let catalogo;
let atual = null;
const cacheCarros = new Map();
const cacheCenarios = new Map();
let cenarioAtual = null;

function montarLista() {
  const lista = $("lista");
  const porMarca = new Map();
  for (const car of catalogo.cars) {
    if (!porMarca.has(car.brand)) porMarca.set(car.brand, []);
    porMarca.get(car.brand).push(car);
  }

  for (const [marca, carros] of porMarca) {
    const h3 = document.createElement("h3");
    h3.textContent = marca;
    lista.appendChild(h3);

    for (const car of carros) {
      const b = document.createElement("button");
      b.dataset.id = car.id;
      b.innerHTML =
        `<span>${car.model}</span>` +
        `<span class="ano">${car.years[0]}</span>` +
        (car.paint ? "" : `<span class="sem-pintura">sem lataria</span>`);
      b.addEventListener("click", () => mostrarCarro(car.id));
      lista.appendChild(b);
    }
  }
}

function montarCores() {
  const box = $("cores");
  for (const { nome, hex } of CORES) {
    const b = document.createElement("button");
    b.style.background = hex;
    b.title = nome;
    b.setAttribute("aria-label", nome);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      limparSelecaoDeCor();
      b.setAttribute("aria-pressed", "true");
      repintar(hex);
    });
    box.appendChild(b);
  }

  const livre = document.createElement("input");
  livre.type = "color";
  livre.value = "#b01f24";
  livre.title = "Cor livre";
  livre.addEventListener("input", () => {
    limparSelecaoDeCor();
    repintar(livre.value);
  });
  box.appendChild(livre);

  const restaurar = document.createElement("button");
  restaurar.className = "restaurar";
  restaurar.textContent = "Cor original";
  restaurar.addEventListener("click", restaurarCor);
  box.appendChild(restaurar);
}

function montarCenarios() {
  const sel = $("cenario");
  sel.innerHTML = `<option value="">Estúdio</option>`;
  for (const c of catalogo.scenery) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => trocarCenario(sel.value));
}

/* ---------------------------------------------------------------- carrega */

function carregarGLB(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

async function mostrarCarro(id) {
  const car = catalogo.cars.find((c) => c.id === id);
  if (!car || (atual && atual.car.id === id)) return;

  document.querySelectorAll(".lista button").forEach((b) =>
    b.setAttribute("aria-current", String(b.dataset.id === id)),
  );

  carregando(true, `carregando ${car.brand} ${car.model}…`);

  try {
    let raiz = cacheCarros.get(id);
    if (!raiz) {
      const gltf = await carregarGLB(`models/${car.file}`);
      raiz = gltf.scene;
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      assentar(raiz, COMPRIMENTO_ALVO, "maior");

      if (car.paint) {
        const mats = materiaisDeLataria(raiz, car.paint.materials);
        coresOriginais.set(id, mats.map((m) => m.color.clone()));
      }
      cacheCarros.set(id, raiz);
    }

    if (atual) scene.remove(atual.raiz);
    scene.add(raiz);
    atual = { car, raiz };

    limparSelecaoDeCor();
    atualizarHud(car);
  } catch (erro) {
    carregando(true, `falhou ao carregar ${car.model}`);
    console.error(erro);
    return;
  }

  carregando(false);
}

function atualizarHud(car) {
  $("carro-nome").textContent = `${car.brand} ${car.model}`;
  $("carro-meta").textContent =
    `${car.years[0]}–${car.years[1]} · ${(car.bytes / 1048576).toFixed(1)} MB`;

  const painel = $("pintura");
  const badge = $("paint-badge");
  const nota = $("paint-nota");

  if (car.paint) {
    painel.dataset.repintavel = "sim";
    badge.dataset.nivel = car.paint.confidence;
    badge.textContent = `confiança ${car.paint.confidence}`;
    const mats = car.paint.materials.map((m) => `<code>${m}</code>`).join(", ");
    nota.innerHTML =
      `Material identificado: ${mats}` +
      (car.paint.textured
        ? " · lataria texturizada, a cor <em>tinge</em> a textura em vez de substituí-la."
        : "");
  } else {
    painel.dataset.repintavel = "nao";
    badge.dataset.nivel = "nulo";
    badge.textContent = "sem mapa";
    nota.innerHTML =
      "Nenhum material passou no critério de lataria neste arquivo, então o " +
      "manifesto traz <code>paint: null</code> — 213 dos 530 carros estão nessa " +
      "situação. Preferimos não repintar a repintar a roda.";
  }

  const { author, authorUrl, license, sourceName, sourceUrl } = car.credit;
  $("credito").innerHTML =
    `Modelo <a href="${sourceUrl}" target="_blank" rel="noopener">${sourceName}</a> ` +
    `por <a href="${authorUrl}" target="_blank" rel="noopener">${author}</a> — licença ${license}.`;
}

async function trocarCenario(id) {
  if (cenarioAtual) {
    scene.remove(cenarioAtual);
    cenarioAtual = null;
  }

  const modoEstudio = !id;
  chao.visible = modoEstudio;
  grade.visible = modoEstudio;

  if (modoEstudio) return;

  const item = catalogo.scenery.find((c) => c.id === id);
  carregando(true, `carregando ${item.name}…`);

  try {
    let raiz = cacheCenarios.get(id);
    if (!raiz) {
      const gltf = await carregarGLB(`models/${item.file}`);
      raiz = gltf.scene;
      raiz.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      assentar(raiz, LARGURA_CENARIO, "horizontal");
      cacheCenarios.set(id, raiz);
    }
    scene.add(raiz);
    cenarioAtual = raiz;
  } catch (erro) {
    console.error(erro);
    chao.visible = true;
    grade.visible = true;
  }

  carregando(false);
}

/* ------------------------------------------------------------------ loop  */

function animar() {
  requestAnimationFrame(animar);
  ajustarTamanho();
  controls.update();
  renderer.render(scene, camera);
}

(async function iniciar() {
  catalogo = await (await fetch("catalog.json")).json();
  montarLista();
  montarCores();
  montarCenarios();
  animar();
  await mostrarCarro("chevrolet-onix");
})();
