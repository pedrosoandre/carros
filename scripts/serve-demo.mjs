#!/usr/bin/env node
/**
 * Servidor estático da demo, para desenvolvimento local.
 *
 * Existe porque a demo precisa de HTTP de verdade: abrir demo/index.html com
 * file:// quebra o fetch do catalog.json e os módulos ES por CORS.
 *
 *   node scripts/serve-demo.mjs [porta]
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo");
const porta = Number(process.argv[2]) || 5173;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const alvo = path.join(raiz, url === "/" ? "index.html" : url);

    // Impede sair de demo/ por ../ na URL.
    if (!alvo.startsWith(raiz)) {
      res.writeHead(403).end("403");
      return;
    }

    fs.readFile(alvo, (erro, dados) => {
      if (erro) {
        res.writeHead(404, { "content-type": "text/plain" }).end("404 " + url);
        return;
      }
      res.writeHead(200, {
        "content-type": TIPOS[path.extname(alvo)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(dados);
    });
  })
  .listen(porta, () => console.log(`demo em http://localhost:${porta}`));
