# Autorização de uso dos modelos 3D

Este documento registra a **fonte**, a **autorização de uso** e as **obrigações
de conformidade** dos arquivos `.glb` distribuídos junto com esta biblioteca:
os 530 modelos de carros (`cars.json`) e os 35 cenários — garagens, oficinas,
showrooms, postos e estacionamentos (`scenery.json`). O tratamento legal é o
mesmo para os dois grupos; abaixo, quando dizemos "modelo", vale para ambos.

## Fonte

Todos os modelos foram baixados da plataforma pública [Sketchfab](https://sketchfab.com),
usando a [Sketchfab Data API v3](https://docs.sketchfab.com/data-api/v3/index.html)
(endpoint `GET /v3/models/{uid}/download`). A busca foi filtrada pelo parâmetro
`license` da própria API, restringindo ao conjunto que permite uso comercial e
obras derivadas:

- `by` — Creative Commons Attribution (CC BY 4.0)
- `by-sa` — Creative Commons Attribution-ShareAlike (CC BY-SA 4.0)

Licenças `by-nc`, `by-nd`, `by-nc-sa`, `by-nc-nd` e `cc0`-restritas foram
excluídas na consulta. A URL da obra original e o autor foram lidos do próprio
retorno da API e estão preservados em `cars.json` (campo `credit`) e em
[CREDITS.md](./CREDITS.md).

## Autorização

A autorização de uso — inclusive comercial, inclusive com modificações e
redistribuição — vem diretamente das licenças Creative Commons escolhidas pelos
próprios autores no momento em que publicaram cada obra no Sketchfab. Não é
necessário pedir permissão adicional; a licença **é** a autorização.

### CC BY 4.0 — 560 arquivos (526 carros + 34 cenários)

Texto integral: <https://creativecommons.org/licenses/by/4.0/legalcode>

Concede, de forma perpétua, mundial, não-exclusiva e livre de royalties, o
direito de:

- **Compartilhar** — copiar e redistribuir em qualquer meio ou formato
- **Adaptar** — remixar, transformar e criar a partir da obra
- para **qualquer finalidade, inclusive comercial**

Sob a única condição de **atribuição**: o crédito ao autor deve ser dado, um
link para a licença deve ser fornecido, e mudanças feitas devem ser indicadas.

### CC BY-SA 4.0 — 5 arquivos (4 carros + 1 cenário)

Texto integral: <https://creativecommons.org/licenses/by-sa/4.0/legalcode>

Arquivos afetados:

| Arquivo | Obra original | Autor |
|---|---|---|
| `porsche-911-carrera.glb` | (FREE) Porsche 911 Carrera 4S | [Lionsharp Studios](https://sketchfab.com/lionsharp) |
| `porsche-959.glb` | Porsche 959 | [Yakpower](https://sketchfab.com/Alexios_Apokaukos) |
| `porsche-mission.glb` | Porsche Mission R | [vecarz](https://sketchfab.com/heynic) |
| `renault-scenic.glb` | Renault scenic 411 | [1-3D.com](https://sketchfab.com/1-3D.com) |
| `scenery/showroom-medium-show-room.glb` | Medium Show Room | [MRowa](https://sketchfab.com/MRowa) |

Concedem os mesmos direitos da CC BY, com a obrigação adicional de que **obras
derivadas destes arquivos específicos devem ser distribuídas sob a mesma licença
CC BY-SA 4.0** (efeito "copyleft").

Consequência prática: uma cena 3D que **contém** um destes modelos como objeto
independente não é obra derivada dele; só é derivada quem *modificar* o próprio
`.glb`. Se você não pretende modificar nenhum dos cinco arquivos acima — o caso
esperado desta biblioteca — a obrigação ShareAlike não se propaga para o seu
código.

A lista acima é derivada dos manifestos, então dá para reconferir a qualquer
momento em vez de confiar neste documento:

```ts
import { CARS, SCENERY } from "carros";
[...CARS, ...SCENERY].filter((m) => m.credit.license.includes("ShareAlike"));
```

## Como esta biblioteca cumpre as obrigações

| Obrigação da CC BY / CC BY-SA | Como é cumprida aqui |
|---|---|
| Atribuir o autor | `credit.author` em cada `Car`, helper `creditLine(car)`, helper `allCredits()`, [CREDITS.md](./CREDITS.md) |
| Link para a obra original | `credit.sourceUrl` em cada `Car` (URL do Sketchfab) |
| Indicar a licença | `credit.license` em cada `Car`; resumo neste arquivo |
| Indicar que houve modificação | Ver seção "Modificações aplicadas" abaixo |
| (BY-SA) Redistribuir derivadas sob mesma licença | Registrada explicitamente para o modelo afetado |

**Se você usar esta biblioteca, essas obrigações passam a ser suas também.**
A forma mais simples de cumprir todas de uma vez é exibir `allCredits()` numa
página "Sobre" ou rodapé do seu produto.

## Modificações aplicadas

Os arquivos `.glb` distribuídos aqui **não são idênticos** aos originais no
Sketchfab. Foram processados com a pipeline abaixo (gltf-transform):

1. `weld` — deduplicação de vértices
2. `simplify` — decimação de geometria (target ~30% dos triângulos)
3. `prune` — remoção de nodes, materiais e texturas não referenciados
4. `meshopt` — compressão meshopt de geometria e atributos

Redução medida: **mediana de -71% por carro** e **-68% no agregado**, com a
metade central dos casos entre -45% e -81%. O ganho não é uniforme: o melhor
caso caiu -92% e o pior apenas -4%, porque modelo já enxuto na origem tem pouco
a decimar. Cenários comprimem menos (mediana -31%) — boa parte do peso deles é
textura, não geometria.

Nenhuma alteração foi feita à identidade visual do modelo, à autoria, ao nome ou
à licença. Esta nota satisfaz a exigência da CC de "indicar se mudanças foram
feitas".

## Termos de serviço da Sketchfab API

O download via API está sujeito aos [Termos de Serviço da Sketchfab](https://sketchfab.com/tos)
e à [Política de Uso Aceitável da API](https://sketchfab.com/developers).
Ambos são compatíveis com o uso feito aqui:

- só foram consultados modelos publicados publicamente na plataforma;
- só foram baixados modelos cuja licença escolhida pelo autor autoriza download
  e uso derivado (a API bloqueia o download em qualquer outro caso);
- a atribuição ao autor está preservada em todos os pontos de exibição.

## Como reportar um problema de licença

Se você é autor de um modelo listado em [CREDITS.md](./CREDITS.md) e:

- quer corrigir o crédito, o link ou o nome da obra, **ou**
- alterou a licença do modelo no Sketchfab depois do download

abra uma issue em <https://github.com/pedrosoandre/carros/issues> ou envie um
email. O modelo será atualizado ou removido conforme o pedido.
