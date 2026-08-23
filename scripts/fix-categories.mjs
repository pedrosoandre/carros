#!/usr/bin/env node
/**
 * Corrige a categoria dos modelos que a heurística automática errou.
 *
 * A heurística original casava nomes por palavra-chave e, quando não reconhecia
 * nada, assumia "hatchback". Isso funcionou para os nacionais (Uno, Gol, Onix)
 * mas errou feio nos importados: Porsche Cayenne, Rolls-Royce Phantom e Ferrari
 * 488 foram todos classificados como hatch.
 *
 * Categoria é dado de catálogo — quem consome filtra por ela. Então aqui vale
 * uma tabela explícita, não mais heurística.
 *
 * Roda sobre cars.json, a fonte de verdade da biblioteca.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** "Marca Modelo" -> categoria correta. */
const CORRECOES = {
  // Esportivos e superesportivos
  "Ferrari 488": "sports", "Ferrari F8": "sports", "Ferrari Portofino": "sports",
  "Ferrari Roma": "sports", "Lamborghini Huracan": "sports",
  "Lamborghini Aventador": "sports", "McLaren 720S": "sports",
  "McLaren 570S": "sports", "Bugatti Chiron": "sports", "Bugatti Veyron": "sports",
  "Aston Martin Vantage": "sports", "Aston Martin DB11": "sports",
  "Dodge Viper": "sports", "Chevrolet Corvette": "sports", "Nissan GT-R": "sports",
  "Nissan 370Z": "sports", "Toyota Supra": "sports", "BMW i8": "sports",
  "BMW Z4": "sports", "Alfa Romeo 4C": "sports", "Porsche 718": "sports",
  "Audi TT": "sports", "Audi RS3": "sports", "Subaru BRZ": "sports",
  "Lexus LC": "sports", "Maserati Ghibli": "sports",

  // Cupês
  "Dodge Challenger": "coupe", "Chevrolet Camaro": "coupe", "Mini Cooper": "coupe",
  "Toyota 86": "coupe", "Mercedes-Benz AMG GT": "coupe", "BMW M3": "coupe",
  "Audi A5": "coupe", "Bentley Continental": "coupe", "Rolls-Royce Phantom": "coupe",

  // SUVs
  "Porsche Cayenne": "suv", "Porsche Macan": "suv", "Rolls-Royce Cullinan": "suv",
  "Bentley Bentayga": "suv", "Lamborghini Urus": "suv", "Maserati Levante": "suv",
  "Cadillac Escalade": "suv", "Cadillac XT5": "suv", "Jaguar F-Pace": "suv",
  "Alfa Romeo Stelvio": "suv", "Audi Q7": "suv", "Audi Q8": "suv",
  "Audi e-tron": "suv", "BMW X6": "suv", "BMW X7": "suv",
  "Mercedes-Benz GLC": "suv", "Mercedes-Benz GLE": "suv", "Mercedes-Benz GLS": "suv",
  "Mercedes-Benz GLA": "suv", "Lexus RX": "suv", "Lexus NX": "suv",
  "Land Rover Range Rover": "suv", "Land Rover Range Rover Sport": "suv",
  "Land Rover Range Rover Velar": "suv", "Volvo XC90": "suv",
  "Dodge Durango": "suv", "Subaru Outback": "suv", "Toyota Land Cruiser": "suv",
  "Genesis GV80": "suv", "BYD Yuan Plus": "suv", "Chery Tiggo 7": "suv",
  "Chery Tiggo 8": "suv", "GWM Haval H6": "suv", "GWM Tank 300": "suv",
  "Mini Countryman": "suv", "Dodge Journey": "suv",

  // Sedãs
  "Porsche Panamera": "sedan", "Porsche Taycan": "sedan", "Jaguar XE": "sedan",
  "Jaguar XF": "sedan", "Lexus ES": "sedan", "Lexus IS": "sedan",
  "Alfa Romeo Giulia": "sedan", "Audi A6": "sedan", "Audi A7": "sedan",
  "Audi A8": "sedan", "BMW Serie 5": "sedan", "BMW Serie 7": "sedan",
  "BMW M5": "sedan", "Mercedes-Benz Classe E": "sedan",
  "Mercedes-Benz Classe S": "sedan", "Mercedes-Benz CLA": "sedan",
  "Volvo S60": "sedan", "Volvo S90": "sedan", "Genesis G80": "sedan",
  "Cadillac CT5": "sedan", "BYD Seal": "sedan", "Chery Arrizo 6": "sedan",

  // Hatches de verdade
  "Audi A1": "hatchback", "BMW Serie 1": "hatchback", "BYD Dolphin": "hatchback",
  "Mercedes-Benz Classe A": "hatchback", "Mini Clubman": "hatchback",
  "Subaru WRX": "sedan", "Suzuki Swift": "hatchback",

  // Peruas
  "Volvo V60": "wagon", "Volvo V40": "wagon",

  // Picapes
  "GWM Poer": "pickup", "Chevrolet Trailblazer": "suv",
};

const manifestPath = path.join(raiz, "cars.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

let alterados = 0;
const naoEncontrados = [];
const aplicados = [];

for (const car of manifest.cars) {
  const chave = `${car.brand} ${car.model}`;
  const nova = CORRECOES[chave];
  if (!nova) continue;
  if (car.category === nova) continue;
  aplicados.push(`${chave}: ${car.category} -> ${nova}`);
  car.category = nova;
  alterados++;
}

for (const chave of Object.keys(CORRECOES)) {
  if (!manifest.cars.some((c) => `${c.brand} ${c.model}` === chave)) naoEncontrados.push(chave);
}

manifest.categories = [...new Set(manifest.cars.map((c) => c.category))];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`corrigidos: ${alterados}`);
aplicados.forEach((a) => console.log(`  ${a}`));
if (naoEncontrados.length) {
  console.log(`\nna tabela mas fora do catálogo (${naoEncontrados.length}): ${naoEncontrados.join(", ")}`);
}

const porCategoria = {};
manifest.cars.forEach((c) => (porCategoria[c.category] = (porCategoria[c.category] ?? 0) + 1));
console.log(`\ndistribuição final:`, JSON.stringify(porCategoria));
