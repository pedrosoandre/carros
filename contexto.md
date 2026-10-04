# Contexto do projeto

Documento de apoio: por que a biblioteca existe, o que já foi verificado sobre
ela e como comunicá-la. O README documenta o **uso**; este arquivo guarda a
**decisão e o argumento**. Última revisão: 03/10/2026.

## O que é, em uma frase

Uma biblioteca instalável de 530 modelos 3D de carros vendidos no Brasil, com
catálogo consultável por código, licença comercial resolvida e o mapa de qual
material é a lataria de cada carro.

## Origem

O projeto não nasceu como fim, e sim como pré-requisito. A necessidade original
era outra: um sistema que precisa mostrar o carro do cliente em 3D. A busca por
uma biblioteca que atendesse não devolveu nada utilizável, e a base teve que ser
construída antes do escopo maior. Daí a ordem — primeiro a fundação, depois o
projeto que ela sustenta.

## Números verificados

Conferidos rodando o próprio pacote em 23/08/2026, não copiados de anotação:

| Métrica | Valor |
|---|---|
| Carros | 530 |
| Marcas | 57 |
| Cenários | 35 (garagem, oficina, showroom, posto, estacionamento) |
| Peso dos assets | 2,1 GB |
| Peso do código instalável | 753 KB em disco |
| Carros com lataria mapeada | 317 (225 confiança alta, 91 média, 1 baixa) |
| Carros sem mapeamento | 213 (`paint: null`, por decisão de não errar) |
| Compressão | mediana de -71% por arquivo |

Nacionais confirmados no catálogo: Kombi, Fusca, Gol, Uno, 147, Palio, Strada,
Opala, Chevette, Monza, Celta, Onix, Corcel, Del Rey, Escort, Ka, Saveiro,
Voyage, Variant, Karmann Ghia, HB20, Toro, Compass.

Ausências conhecidas, úteis como roteiro: Brasília, Parati, Santana, Kadett,
Tempra, Belina — e, entre os atuais, Sandero, Mobi e Argo.

## Pesquisa de alternativas

Feita em agosto de 2026 em npm, GitHub, marketplaces e fontes lusófonas. O
levantamento completo, com links, está no README (seção "O que existe lá fora").
O resumo do que importa:

**Existe muito carro 3D gratuito.** Kenney (50 modelos CC0 em GLB), Quaternius
(8), poly.pizza (10.600 com API). Todos genéricos e estilizados.

**Existe pack brasileiro pago.** TurboSquid e 3D1 vendem coleções com Kombi,
Fusca, Gol e Parati — em FBX/Blender, formato de modelagem, não de web.

**Existe coleção brasileira gratuita.** Uma no Sketchfab, com 15 carros. É uma
lista de favoritos: licença não uniforme, parte nem é baixável, zero metadado.

**Não existe pacote instalável** com catálogo consultável, ficha técnica por
veículo e mapeamento de lataria. Essa é a lacuna real.

### Como afirmar isso sem errar

| Afirmação | Veredito |
|---|---|
| "Não existe biblioteca de carros 3D" | **falsa** — Kenney e poly.pizza desmentem |
| "Não existe pack de carros brasileiros" | **falsa** — TurboSquid vende um |
| "Não existe pacote instalável, com catálogo e lataria mapeada" | **verdadeira** |

A frase que sobrevive a qualquer comentário: *"Carro 3D de graça tem aos montes.
Carro 3D que o seu cliente reconhece como o carro dele, não."* Ela concede o que
é verdade e ainda assim crava o diferencial.

Ressalva honesta: a busca foi de boa-fé, não é prova de inexistência — é
enviesada pelo que o Google indexa e pelo inglês. Por isso a comunicação pública
deve convidar correção em vez de cravar exclusividade.

## Por que é biblioteca, e não acervo

Uma pasta com 530 `.glb` seria um acervo. O que faz desta uma biblioteca é o que
não é modelo 3D:

- instala por gerenciador de pacote (`npm install github:pedrosoandre/carros`);
- exporta funções que outro programa chama (`findCar`, `carsByBrand`,
  `searchCars`, `modelUrl`, `creditLine`, `allCredits`, `sceneryByKind`…);
- tem contrato de tipos (`Car`, `PaintTarget`, `Credit`, `SceneryItem`).

O catálogo vem embutido no pacote e carrega sem rede, sem servidor e sem
download. Os 2,1 GB de assets são o conteúdo que ela serve — não são ela. É
justamente por isso que a instalação tem dois passos: o código vem pelo npm, os
modelos vêm pelo `npx carros-assets`, e o segundo passo aceita filtro por marca,
categoria ou lista, para o projeto copiar só o que usa.

## Onde isso vale dinheiro

O diferencial não é "ter carro 3D": é repintar a lataria e ter licença
comercial. Logo, o alvo é quem precisa mostrar *aquele* carro, do cliente.

| Segmento | Aplicação |
|---|---|
| Vistoria e sinistro | marcar avaria no 3D em vez do diagrama 2D; laudo na cor certa |
| Locadoras e carsharing | check-in/check-out com marcação de dano |
| Marketplace de usados | configurador de cor no anúncio |
| Gestão de oficina | orçamento visual e checklist de entrada |
| Frota e telemetria | gêmeo digital do veículo no painel |
| Concessionária | configurador de cor — uso literal do campo `paint` |
| Perícia e jurídico | reconstituição de acidente para laudo e processo |

Observação comercial: em seguros, quem compra software raramente é a seguradora
direto — é o fornecedor dela (empresa de vistoria, regulador, insurtech). Ciclo
de venda muito mais curto por esse caminho.

## Aberturas: portas, capô e tampa

Frente aberta em 02–03/10/2026, commit `c3e4187` na branch `feat/aberturas`
(ainda não mergeada na `main`). Código em `demo/aberturas.js`, verificador em
`scripts/checar-aberturas.mjs`.

A ideia: boa parte do acervo já vem com as peças separadas em nós. O que falta é
a dobradiça, e ela sai da geometria — a aresta da caixa envolvente da peça que
encosta no resto da carroceria. Sai por geometria e não por convenção de nome
porque cada autor aponta o carro para um lado; o nome diz *que peça é*, a
posição diz *para onde abre*.

### Números verificados

Rodando `node scripts/checar-aberturas.mjs` nos 530, em 03/10/2026:

| Métrica | Valor |
|---|---|
| Modelos que abrem alguma peça | 125 |
| Modelos com porta + capô + tampa | 57 |
| Peças animáveis no total | 428 |
| Defeitos detectados | 0 |

Dos 405 que não abrem, a causa **não é** a que a demo dizia antes:

| Causa | Modelos |
|---|---|
| Carroceria é mesmo uma malha fundida | 34 |
| Peças separadas, nome sem significado | 355 |
| Tem nome de peça, caiu em algum filtro | 16 |

O Onix tem **126 malhas** — está todo separado. Os nós se chamam `group_12`,
`instance_0`, `onix_90_31`. A peça existe; o rótulo não.

### A descoberta que importa comercialmente

A abertura não acompanha a relevância do carro no Brasil — acompanha **o autor
do modelo**. Merc_TV abre em 85% dos seus 13 modelos, Black Snow em 82% dos 38;
Lexyc16, Comrade1280 e David_Holiday ficam em 0%. Por categoria, cupê e
esportivo lideram e sedan fica em 13%.

O resultado prático: Polo, T-Cross, Creta, Palio, Fiesta, Gol e Uno abrem. **Mas
Onix, HB20, Strada, Kwid, Compass, Renegade, Corolla, Saveiro, Celta, Corsa,
Opala, Kombi e Fusca não.** Se o caso de uso é "mostrar o carro do cliente", o
acervo de aberturas está no lado errado da curva de vendas. Isso precisa entrar
na comunicação com honestidade — a feature é real, a cobertura é enviesada.

### Pendências desta frente

- [ ] **Mustang abre 4 portas e tem 2.** `GT500.DoorGlass.L/R` virou peça
      própria depois que `palavras()` passou a quebrar camelCase: o vidro abre
      como se fosse porta. Vale para `ford-mustang` e `ford-mustang-shelby`.
      Somar `glass|window` a `ACESSORIOS` conserta esses e os Nissan 180sx/240sx
      (3→2 portas em cupê de 2), mas custa `lamborghini-gallardo` (3→1 porta),
      `datsun-satsuma-gt` (perde o capô) e `range-rover-sport` (perde a tampa).
      É troca, não ganho — precisa de inspeção modelo a modelo.
- [ ] **O verificador não testa lado de dobradiça.** "0 defeitos" não prova que
      abre certo: ENGOLIU, ORBITA e AFUNDA não detectam porta com dobradiça na
      aresta errada, que gira dentro do próprio tamanho e acima do chão. Foi por
      medir o capô do Logan à mão que o erro apareceu. Falta um teste que
      compare o lado da dobradiça com a frente do carro.
- [ ] **Os 355 sem nome só saem por geometria.** Nenhuma palavra nova no
      vocabulário alcança `group_12`. Para esses seria preciso classificar pela
      forma: peça lateral de ~30% do comprimento, encostada na carroceria,
      espelhada no outro lado. É classificador novo, não é modelagem manual —
      a geometria já está toda no arquivo.
- [ ] Decidir se a branch `feat/aberturas` entra na `main` antes ou depois de
      resolver o Mustang.

## Divulgação

O texto do post de lançamento fica em `docs/post-linkedin.md`.

Hashtags escolhidas — três técnicas para achar quem instala, três de mercado
para alcançar quem compra:
`#threejs #webgl #opensource #automotivo #insurtech #gestaodefrotas`

Deliberadamente evitadas: `#inovacao` e `#tecnologia`, genéricas demais, que
diluem o alcance e atraem engajamento vazio.

Princípios de comunicação deste projeto, aprendidos na revisão do primeiro post:

- citar carro nacional pelo nome; "Kombi" comunica mais que "530 modelos";
- números defensáveis, nunca redondos por força de expressão;
- conceder o que é verdade sobre os concorrentes fortalece o argumento;
- creditar os autores dos modelos com afeto, não como obrigação jurídica.

## Pendências

- [ ] Publicar no npm — hoje a instalação depende do GitHub.
- [ ] Verificar o limite de tamanho por arquivo do jsDelivr antes de indicar CDN
      em produção.
- [ ] Adicionar os ausentes conhecidos (Brasília, Parati, Santana, Sandero).
- [ ] Revisar com olhar jurídico a nota sobre marcas: catálogo público por marca
      convida contato de fabricante.
