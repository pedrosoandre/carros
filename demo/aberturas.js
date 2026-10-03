/**
 * Portas, capô e tampa que abrem, deduzidos do próprio .glb.
 *
 * Boa parte do acervo já vem com as peças separadas em nós com nome
 * (`02_car_body_lf_door`, `07_car_body_trunk`) — 125 dos 530 modelos têm ao
 * menos uma, e 57 têm porta, capô e tampa. Mas nó com nome não basta: ele gira
 * em torno da origem do arquivo, não da dobradiça. Girar direto faz a porta
 * ORBITAR o carro em vez de abrir.
 *
 * Nos outros 405, o nome é que falta, não a peça: só 34 são malha fundida de
 * verdade — os demais vêm separados (o Onix tem 126 malhas) com nome de lixo de
 * exportação, tipo `group_12` e `onix_90_31`. Para esses não há vocabulário que
 * resolva; precisariam de classificação pela geometria.
 *
 * O que falta é a dobradiça, e ela sai da geometria: é a aresta da caixa
 * envolvente da peça que encosta no resto do carro. Um grupo-pivô nasce nessa
 * aresta, adota as peças com `attach()` (que preserva a posição no mundo) e
 * passa a girar no lugar certo.
 *
 * Por que geometria e não convenção de nome: os modelos vêm de autores
 * diferentes, cada um com o carro apontado para um lado e o eixo do exportador
 * trocado. O nome diz QUE PEÇA é; a posição diz PARA ONDE ela abre. Só pelo
 * nome, o sentido sairia invertido em boa parte do acervo.
 *
 * Sem dependência além do three que o consumidor já usa.
 */
import * as THREE from "three";

/* ------------------------------------------------------- classificação --- */

/* Peças que levam o nome da parte mas ficam na carroceria: o batente não abre
   junto com a porta. Testado antes do tipo, para tirar o nó da conta. */
const FIXAS = /batente|jamb|sill|soleira|threshold|weatherstrip|pillar|pilar/i;

/* Enfeite da peça: friso, puxador, emblema, fechadura. Acompanha a porta quando
   ela existe, mas NUNCA cria uma sozinho — num Golf do acervo, os dois
   `molding_door_*_chrome` viravam "duas portas", e abrir dava dois filetes de
   cromado girando no ar enquanto a porta de verdade ficava parada. */
const ACESSORIOS = /molding|moldura|friso|trim|handle|puxador|ma[cç]aneta|emblem|badge|logo|lock|fecho|hinge|dobradi/i;

/* Piso de tamanho: peça que abre é grande. Porta de carro passa dos 20% do
   comprimento do carro, capô e tampa também. Abaixo disso é lasca solta que o
   autor deixou com o nome da peça — abrir aquilo não lê como abrir nada. */
const MINIMO_DA_PECA = 0.12;

/* Quebra o nome em palavras, inclusive no camelCase. Separar só nos caracteres
   não-alfanuméricos exigiria a palavra como token isolado, e aí `doorZL` (as
   quatro portas do Logan), `DoorFrontLeft` (o up!) e `trunkLid` não casavam com
   nada — o nó dizia qual peça era e a varredura devolvia null. */
const palavras = (nome) => nome
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .toLowerCase().split(/[^a-z0-9àâãéêíóôõúç]+/).filter(Boolean);

/**
 * Tipo da peça pelo nome do nó, ou null se não abre.
 *
 * A tampa é testada antes da porta de propósito: "porta-malas" contém "porta",
 * e classificada como porta ela giraria no eixo errado — de pé, varrendo a
 * traseira, em vez de levantar.
 */
export function tipoDaPeca(nome) {
  if (!nome || FIXAS.test(nome)) return null;
  const t = palavras(nome);
  const tem = (...ps) => ps.some((p) => t.includes(p));
  if (tem("trunk", "boot", "tailgate", "liftgate", "hatch", "tampa", "mala", "malas")) return "tampa";
  /* `kapot` é capô em russo, e boa parte do acervo vem de autor russo. Vale
     além da peça em si: `sentidoDaFrente` usa o capô para saber para onde o
     carro aponta, e sem ele o Logan caía no palpite — dobradiça na aresta de
     trás, as quatro portas abrindo para frente. */
  if (tem("hood", "bonnet", "capo", "capô", "kapot")) return "capo";
  if (tem("door", "doors", "porta", "portas", "tuer")) return "porta";
  return null;
}

/* O gênero viaja junto porque a frase do painel concorda com a peça: a porta
   fica "aberta", o capô fica "aberto". */
const ROTULO = {
  porta: { nome: "Porta", genero: "a" },
  capo: { nome: "Capô", genero: "o" },
  tampa: { nome: "Porta-malas", genero: "o" },
};

/* Quanto cada peça abre. Porta de carro para no limitador perto dos 65°; capô
   e tampa sobem mais, mas não até a vertical. */
const ABERTURA = {
  porta: THREE.MathUtils.degToRad(64),
  capo: THREE.MathUtils.degToRad(50),
  tampa: THREE.MathUtils.degToRad(52),
};

/* ------------------------------------------------------------ varredura --- */

/**
 * Coleta os nós que abrem, sem entrar dentro de um já coletado: a porta é o nó
 * inteiro, e um pivô dentro de outro faria a peça girar duas vezes.
 */
function coletar(no, raiz, saida) {
  const tipo = no === raiz ? null : tipoDaPeca(no.name);
  if (tipo) { saida.push({ no, tipo }); return; }
  for (const filho of no.children) coletar(filho, raiz, saida);
}

/** Caixa e centro da peça, em coordenadas do mundo; null se não tem geometria. */
function medir(no) {
  const caixa = new THREE.Box3().setFromObject(no);
  return caixa.isEmpty() ? null : { caixa, centro: caixa.getCenter(new THREE.Vector3()) };
}

/* Acima disso, o que casou com o nome é a carroceria, não a peça. Meio carro é
   folgado de propósito: porta de cupê com vidro e forro chega perto de 40%. */
const LIMITE_ENGOLIU = 0.45;

const _tamanho = new THREE.Vector3();
const volume = (caixa) => {
  caixa.getSize(_tamanho);
  return Math.max(_tamanho.x, 1e-9) * Math.max(_tamanho.y, 1e-9) * Math.max(_tamanho.z, 1e-9);
};

/**
 * Para que lado o carro aponta, no eixo do comprimento.
 *
 * O capô fica na frente; a tampa, atrás. Com um dos dois o sentido está
 * resolvido, e é o caso de quase todo modelo do acervo. Sem nenhum, sobra o
 * nome: `lf`/`rf`/`front` marcam a dianteira.
 */
function sentidoDaFrente(pecas, comprimento, centroCarro) {
  const medioDe = (tipo) => {
    const ms = pecas.filter((p) => p.tipo === tipo);
    return ms.length ? ms.reduce((s, p) => s + p.centro[comprimento], 0) / ms.length : null;
  };

  const capo = medioDe("capo");
  if (capo !== null) return Math.sign(capo - centroCarro[comprimento]) || 1;

  const tampa = medioDe("tampa");
  if (tampa !== null) return -(Math.sign(tampa - centroCarro[comprimento]) || 1);

  const dianteiras = pecas.filter((p) => /(^|[^a-z])(lf|rf|fl|fr|front|dianteir)/i.test(p.no.name || ""));
  if (dianteiras.length) {
    const m = dianteiras.reduce((s, p) => s + p.centro[comprimento], 0) / dianteiras.length;
    return Math.sign(m - centroCarro[comprimento]) || 1;
  }
  return 1;
}

/**
 * Sinal que abre: gira a ponta solta um pouco e vê se ela foi para onde devia.
 * Descobrir o sinal assim evita depender da mão do eixo do arquivo, que muda de
 * exportador para exportador.
 */
function sentidoQueAbre(solto, dobradica, eixo, melhorou) {
  const giro = solto.clone().sub(dobradica).applyAxisAngle(eixo, 0.3).add(dobradica);
  return melhorou(giro) > melhorou(solto) ? 1 : -1;
}

/* ------------------------------------------------------------- montagem --- */

/**
 * Prepara as aberturas de um modelo já carregado (a `gltf.scene`).
 *
 * Reparenta cada peça num grupo-pivô na dobradiça e marca o pivô com
 * `userData.dobradica` = { eixo, sentido, abertura, alvo }.
 *
 * @param {THREE.Object3D} raiz
 * @returns {Array<{tipo: string, rotulo: string, pivo: THREE.Object3D}>} o que
 *   ficou pronto para abrir — vazio quando o modelo é uma malha fundida só.
 */
export function prepararAberturas(raiz) {
  raiz.updateMatrixWorld(true);

  const total = new THREE.Box3().setFromObject(raiz);
  if (total.isEmpty()) return [];
  const tam = total.getSize(new THREE.Vector3());
  const centroCarro = total.getCenter(new THREE.Vector3());

  /* Qual eixo é o comprimento do carro: o maior dos dois horizontais. Assumir Z
     daria errado em todo modelo exportado do 3ds Max, que usa X. */
  const comprimento = tam.x >= tam.z ? "x" : "z";
  const lateral = comprimento === "x" ? "z" : "x";

  const brutas = [];
  coletar(raiz, raiz, brutas);

  const pecas = [];
  for (const { no, tipo } of brutas) {
    const m = medir(no);
    if (!m) continue;
    if (ACESSORIOS.test(no.name)) { pecas.push({ no, tipo, acessorio: true, ...m }); continue; }
    /* Peça que atravessa a linha de centro é um nó que embrulha os dois lados
       ("doors" com as quatro portas dentro). Não há uma dobradiça só que sirva
       para ela: desce e tenta os filhos. */
    if (tipo === "porta" && Math.abs(m.centro[lateral] - centroCarro[lateral]) < tam[lateral] * 0.08) {
      const filhos = [];
      for (const f of no.children) coletar(f, raiz, filhos);
      for (const f of filhos) { const mf = medir(f.no); if (mf) pecas.push({ ...f, ...mf }); }
      continue;
    }
    pecas.push({ no, tipo, ...m });
  }
  if (!pecas.length) return [];

  /* Nome que mente: há arquivo em que `boot` é o carro inteiro, em que TODO nó
     começa com `hatch_` (é o estilo de carroceria, não a tampa) e em que todo
     objeto termina em `_Door.0NN` por lixo de exportação do Blender. O teste é
     de volume: se tudo que casou com um tipo junto ocupa quase o carro, aquele
     nome não está marcando peça nenhuma aqui — e girar isso giraria o carro. */
  const volumeCarro = volume(total);
  for (const tipo of new Set(pecas.map((p) => p.tipo))) {
    const juntas = new THREE.Box3();
    for (const p of pecas) if (p.tipo === tipo) juntas.union(p.caixa);
    if (volume(juntas) > volumeCarro * LIMITE_ENGOLIU) {
      for (let i = pecas.length - 1; i >= 0; i--) if (pecas[i].tipo === tipo) pecas.splice(i, 1);
    }
  }
  if (!pecas.length) return [];

  const frente = sentidoDaFrente(pecas, comprimento, centroCarro);

  /* Agrupa pelo que é a MESMA peça física: a porta dianteira esquerda do
     T-Cross são doze nós (lataria, vidro, forro, retrovisor) que têm de girar
     juntos. Lado e fila saem da posição, não do nome — `lf` num arquivo é `fl`
     no outro, e há modelo sem marcação nenhuma. */
  const chaveDe = (p) => {
    const lado = p.tipo === "porta" ? (p.centro[lateral] >= centroCarro[lateral] ? "a" : "b") : "-";
    const fila = p.tipo === "porta"
      ? (Math.sign(p.centro[comprimento] - centroCarro[comprimento]) === frente ? "d" : "t")
      : "-";
    return `${p.tipo}|${lado}|${fila}`;
  };

  const grupos = new Map();
  for (const p of pecas) {
    if (p.acessorio) continue;                       // enfeite entra depois, se houver peça
    const chave = chaveDe(p);
    if (!grupos.has(chave)) {
      const [, lado, fila] = chave.split("|");
      grupos.set(chave, { tipo: p.tipo, lado, fila, pecas: [] });
    }
    grupos.get(chave).pecas.push(p);
  }

  /* Agora sim os enfeites: o friso da porta esquerda vai junto com ela. Sem
     porta naquele lugar, ele fica onde está — friso não abre sozinho. */
  for (const p of pecas) {
    if (!p.acessorio) continue;
    grupos.get(chaveDe(p))?.pecas.push(p);
  }

  const comprimentoCarro = Math.max(tam.x, tam.z);
  const prontas = [];
  for (const grupo of grupos.values()) {
    const juntas = new THREE.Box3();
    for (const p of grupo.pecas) juntas.union(p.caixa);
    const t = juntas.getSize(new THREE.Vector3());
    if (Math.max(t.x, t.y, t.z) < comprimentoCarro * MINIMO_DA_PECA) continue;

    const pronta = montarPivo(grupo, { comprimento, lateral, frente, centroCarro });
    if (pronta) prontas.push(pronta);
  }
  return prontas;
}

/** Calcula a dobradiça de um grupo e reparenta as peças nela. */
function montarPivo(grupo, ctx) {
  const { comprimento, lateral, frente, centroCarro } = ctx;
  const { tipo, pecas } = grupo;

  const uniao = new THREE.Box3();
  for (const p of pecas) uniao.union(p.caixa);
  if (uniao.isEmpty()) return null;
  const centro = uniao.getCenter(new THREE.Vector3());

  /* Onde fica o eixo da dobradiça, no comprimento do carro: porta e tampa giram
     pela aresta voltada para a FRENTE (a porta abre para trás; a tampa levanta
     pelo lado do teto); o capô, pela aresta de trás, encostada no para-brisa. */
  const paraFrente = tipo !== "capo";
  const naFrente = (frente > 0) === paraFrente;

  const dobradica = new THREE.Vector3();
  const solto = new THREE.Vector3();
  dobradica[comprimento] = naFrente ? uniao.max[comprimento] : uniao.min[comprimento];
  solto[comprimento] = naFrente ? uniao.min[comprimento] : uniao.max[comprimento];
  dobradica[lateral] = centro[lateral];
  solto[lateral] = centro[lateral];

  let eixoNome;
  let melhorou;
  if (tipo === "porta") {
    /* Gira em pé, pela aresta dianteira. Abriu certo quando a ponta solta se
       afastou da linha de centro do carro. */
    eixoNome = "y";
    dobradica.y = centro.y;
    solto.y = centro.y;
    melhorou = (v) => Math.abs(v[lateral] - centroCarro[lateral]);
  } else {
    /* Capô e tampa giram deitados, pela aresta de cima, e abrem para cima. */
    eixoNome = lateral;
    dobradica.y = uniao.max.y;
    solto.y = uniao.max.y;
    melhorou = (v) => v.y;
  }

  const eixoVetor = new THREE.Vector3(+(eixoNome === "x"), +(eixoNome === "y"), +(eixoNome === "z"));
  const sentido = sentidoQueAbre(solto, dobradica, eixoVetor, melhorou);

  const pai = pecas[0].no.parent;
  if (!pai) return null;

  const pivo = new THREE.Group();
  pivo.name = `dobradica-${tipo}-${grupo.lado}${grupo.fila}`;
  pai.add(pivo);

  /* O pivô nasce sem a rotação herdada do pai: com o mundo dele na identidade,
     o eixo que calculamos aqui (do mundo) É o eixo de giro dele. A cadeia do
     Sketchfab costuma trazer -90° em X para converter de Z-up, e sem isso a
     porta giraria deitada. */
  const giroPai = new THREE.Quaternion();
  pai.getWorldQuaternion(giroPai);
  const repouso = giroPai.invert();
  pivo.quaternion.copy(repouso);
  pivo.position.copy(pai.worldToLocal(dobradica.clone()));
  pivo.updateMatrixWorld(true);

  /* `attach` preserva a posição no mundo ao trocar de pai — sem ele a peça
     saltaria para cima da dobradiça no instante em que entrasse no grupo. */
  for (const p of pecas) pivo.attach(p.no);

  pivo.userData.dobradica = {
    eixo: eixoVetor,
    /* A orientação de repouso vai guardada porque girar é multiplicar por cima
       dela. Escrever em `pivo.rotation` seria mais curto e está ERRADO: no
       three.js o euler e o quaternion são espelhados, então mexer na rotação
       recalcula o quaternion do zero e apaga esta compensação — a peça abria
       para baixo em todo modelo cuja cadeia de pais tem rotação. */
    repouso,
    angulo: 0,
    alvo: 0,
    aberto: sentido * ABERTURA[tipo],
    tipo,
    rotulo: ROTULO[tipo].nome,
    genero: ROTULO[tipo].genero,
  };
  return { tipo, rotulo: ROTULO[tipo].nome, pivo };
}

/* ------------------------------------------------------------- operação --- */

/** Sobe do que o raio acertou até a peça que abre, ou null se não for uma. */
export function pecaDe(objeto) {
  for (let o = objeto; o; o = o.parent) if (o.userData?.dobradica) return o;
  return null;
}

const _giro = new THREE.Quaternion();

/**
 * Põe a peça num ângulo. É o único lugar que mexe na pose do pivô — ver a nota
 * sobre `repouso` em `montarPivo`.
 */
export function posicionarPeca(pivo, angulo) {
  const d = pivo.userData.dobradica;
  d.angulo = angulo;
  pivo.quaternion.copy(d.repouso).multiply(_giro.setFromAxisAngle(d.eixo, angulo));
}

/**
 * Abre ou fecha UMA peça. Sem `abrir`, inverte o estado.
 * @returns {boolean} o novo estado
 */
export function alternarPeca(pivo, abrir) {
  const d = pivo.userData.dobradica;
  const aberto = abrir ?? d.alvo === 0;
  d.alvo = aberto ? d.aberto : 0;
  return aberto;
}

/** Fecha tudo o que estiver aberto no carro. */
export function fecharTudo(raiz) {
  raiz.traverse((o) => { if (o.userData?.dobradica) o.userData.dobradica.alvo = 0; });
}

/**
 * Avança a animação um quadro, com desaceleração exponencial.
 * @returns {boolean} true enquanto alguma peça ainda estiver se mexendo
 */
export function animarAberturas(raiz, dt) {
  if (!raiz) return false;
  let mexendo = false;
  const passo = Math.min(1, dt * 9);
  raiz.traverse((o) => {
    const d = o.userData?.dobradica;
    if (!d) return;
    const falta = d.alvo - d.angulo;
    if (Math.abs(falta) < 0.002) {
      if (d.angulo !== d.alvo) posicionarPeca(o, d.alvo);
    } else {
      posicionarPeca(o, d.angulo + falta * passo);
      mexendo = true;
    }
  });
  return mexendo;
}
