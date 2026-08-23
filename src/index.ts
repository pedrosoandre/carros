/**
 * carros — biblioteca aberta de modelos 3D de carros vendidos no Brasil.
 *
 * Os dados vêm de cars.json e scenery.json, gerados a partir dos arquivos
 * reais em assets/. Eles não são importados como JSON: `npm run build:data`
 * embute os dois em src/generated/manifests.ts, porque `import x from "./x.json"`
 * quebra em Node ESM puro (falta `with { type: "json" }`) e em bundlers sem
 * suporte a import attributes.
 */
import { carsManifest as manifest, sceneryManifest } from "./generated/manifests.js";

export type VehicleCategory =
  | "hatchback" | "sedan" | "suv" | "pickup" | "wagon"
  | "minivan" | "van" | "coupe" | "sports" | "utility";

export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  hatchback: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  pickup: "Picape",
  wagon: "Perua",
  minivan: "Minivan",
  van: "Van",
  coupe: "Cupê",
  sports: "Esportivo",
  utility: "Utilitário",
};

/** Qual material do arquivo é a pintura da lataria (ver README). */
export interface PaintTarget {
  materials: string[];
  /** Se true, a cor escolhida tinge a textura original em vez de substituí-la. */
  textured: boolean;
  confidence: "alta" | "média" | "baixa";
}

/** Atribuição obrigatória: todos os modelos são CC BY ou CC BY-SA. */
export interface Credit {
  author: string;
  authorUrl: string | null;
  license: string;
  sourceName: string | null;
  sourceUrl: string | null;
}

export interface Car {
  id: string;
  brand: string;
  model: string;
  /** [primeiro ano, último ano] de produção coberto pelo modelo 3D. */
  years: [number, number];
  category: VehicleCategory;
  file: string;
  bytes: number;
  /** null quando não foi possível identificar a lataria com segurança. */
  paint: PaintTarget | null;
  credit: Credit;
}

export const CARS: Car[] = manifest.cars as Car[];
export const BRANDS: string[] = manifest.brands;
export const VERSION: string = manifest.version;

/**
 * Onde os .glb são servidos. O padrão assume que você copiou `assets/` para a
 * pasta pública do seu app (ex.: `public/cars/`).
 *
 * Enquanto o repositório é privado não há CDN: jsDelivr e similares só servem
 * repositório público. Se a biblioteca for aberta, passa a valer também:
 *   https://cdn.jsdelivr.net/gh/pedrosoandre/carros@v1.0.0/assets
 */
export const DEFAULT_BASE_URL = "/cars";

export function carsByBrand(brand: string): Car[] {
  return CARS.filter((c) => c.brand === brand);
}

export function findCar(brand: string, model: string): Car | undefined {
  return CARS.find((c) => c.brand === brand && c.model === model);
}

export function getCar(id: string): Car | undefined {
  return CARS.find((c) => c.id === id);
}

export function carsByCategory(category: VehicleCategory): Car[] {
  return CARS.filter((c) => c.category === category);
}

/** Busca livre por marca e modelo, sem depender de acento ou caixa. */
export function searchCars(query: string): Car[] {
  const q = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!q) return CARS;
  return CARS.filter((c) =>
    `${c.brand} ${c.model}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q),
  );
}

/** URL do .glb. Passe baseUrl para servir de outro lugar (bucket próprio, /public). */
export function modelUrl(car: Car | string, baseUrl: string = DEFAULT_BASE_URL): string {
  const file = typeof car === "string" ? `${car}.glb` : car.file;
  return `${baseUrl.replace(/\/$/, "")}/${file}`;
}

/**
 * Linha de crédito pronta para exibir. A licença CC BY **exige** que o autor
 * apareça sempre que o modelo for mostrado publicamente.
 */
export function creditLine(car: Car): string {
  const { author, license, sourceName } = car.credit;
  return `"${sourceName ?? car.model}" por ${author}, licença ${license}`;
}

/** Todos os créditos (carros + cenários), para uma página "Sobre" ou rodapé. */
export function allCredits(): string[] {
  const carLines = CARS.map(creditLine);
  const sceneryLines = SCENERY.map(sceneryCreditLine);
  return [...new Set([...carLines, ...sceneryLines])].sort();
}

/* -------------------------------------------------------------------------- */
/*  Cenários (garagens, oficinas, showrooms)                                  */
/* -------------------------------------------------------------------------- */

export type SceneryKind =
  | "garage" | "workshop" | "showroom" | "gas-station" | "parking" | "other";

export const SCENERY_KIND_LABELS: Record<SceneryKind, string> = {
  garage: "Garagem",
  workshop: "Oficina",
  showroom: "Showroom",
  "gas-station": "Posto",
  parking: "Estacionamento",
  other: "Cenário",
};

/** Bounding box do cenário — importante para posicionar câmera e carro dentro. */
export interface SceneryBbox {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: { x: number; y: number; z: number };
}

export interface SceneryItem {
  id: string;
  name: string;
  kind: SceneryKind;
  /** Caminho relativo ao baseUrl (ex.: "scenery/old-garage.glb"). */
  file: string;
  bytes: number;
  /** null se a medição do bbox falhou. */
  bbox: SceneryBbox | null;
  credit: Credit;
}

export const SCENERY: SceneryItem[] = sceneryManifest.scenery as SceneryItem[];
export const SCENERY_KINDS: SceneryKind[] = (sceneryManifest.kinds ?? []) as SceneryKind[];

export function getScenery(id: string): SceneryItem | undefined {
  return SCENERY.find((s) => s.id === id);
}

export function sceneryByKind(kind: SceneryKind): SceneryItem[] {
  return SCENERY.filter((s) => s.kind === kind);
}

/** URL do .glb do cenário. Mesmo baseUrl dos carros; o file já inclui `scenery/`. */
export function sceneryUrl(item: SceneryItem | string, baseUrl: string = DEFAULT_BASE_URL): string {
  const file = typeof item === "string" ? `scenery/${item}.glb` : item.file;
  return `${baseUrl.replace(/\/$/, "")}/${file}`;
}

export function sceneryCreditLine(item: SceneryItem): string {
  const { author, license, sourceName } = item.credit;
  return `"${sourceName ?? item.name}" por ${author}, licença ${license}`;
}
