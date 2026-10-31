# Instrumento de recolha — tarefa de pontaria em browser

Página única, sem dependências, para recolher dados de interação humana e
automatizada. Abre em qualquer browser moderno, não instala nada, e os dados
nunca saem da máquina do participante sem ele clicar em descarregar.

---

## Qual versão estou a correr?

O número aparece em baixo no ecrã de instruções, no resumo final, e no campo
`schema` de cada ficheiro de sessão. **Versão atual: `aim-logger-1.2`.**

Se publicar uma versão nova e o browser continuar a mostrar a antiga, é cache:
`Ctrl+Shift+R` força o recarregamento. Vale a pena confirmar o número antes de
reportar qualquer comportamento estranho — poupa tempo aos dois.

## ⚠ Antes de distribuir

A página tem campos marcados `[A PREENCHER]`. Enquanto existir algum, aparece um
aviso amarelo no topo do ecrã de consentimento. Abra `index.html` num editor e
substitua:

| Onde | O quê |
|---|---|
| Ecrã de consentimento | nome do orientador |
| Ecrã de consentimento | referência e data da aprovação ética |

O responsável e o email de envio já estão preenchidos
(Diogo Lage · `50056610@europeia.pt`).

O aviso desaparece sozinho quando não restar nenhum `[A PREENCHER`.

**Não distribua antes de ter aprovação ética.** O texto de consentimento está
escrito, mas a aprovação é um processo, não um parágrafo.

---

## Como pôr a correr

Abrir o ficheiro diretamente (`file://`) funciona para testar, mas para os
participantes precisa de um endereço. Qualquer alojamento estático serve:
GitHub Pages, Netlify, Cloudflare Pages, ou a página pessoal da universidade.
É um ficheiro só.

**Não funciona dentro de iframes com sandbox** (artifacts do Claude, CodePen,
JSFiddle e afins). Esses frames bloqueiam downloads iniciados pela página e
restringem o pointer lock — as duas coisas de que o instrumento depende. Precisa
de uma página servida normalmente, no seu próprio endereço.

Para testar localmente com servidor:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

### ⚠ Cabeçalhos COOP/COEP — não é opcional

Medido numa sessão real de 207 segundos, servida sem estes cabeçalhos:

| | Resultado |
|---|---|
| Amostras recolhidas | 11 760 |
| Instantes **distintos** | 7 136 |
| Amostras que partilham timestamp com outra | **39 %** |
| Resolução do relógio | 1 ms (inteiros) |
| Energia na banda de tremor 8–12 Hz | 6 % — indistinguível do ruído |

O browser arredonda `performance.now()` a 1 ms por omissão, por causa das
mitigações de Spectre. As amostras coalescidas chegam todas no mesmo frame e
colapsam para o mesmo instante. Resultado: a **ordem** das amostras preserva-se
(está no 4.º valor de cada amostra), mas o **tempo real entre elas perde-se** —
e com ele a análise de frequências que sustenta a hipótese do tremor.

Com os cabeçalhos, `crossOriginIsolated` passa a `true` e a resolução sobe para
microssegundos.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**O GitHub Pages não permite cabeçalhos personalizados.** Para este projeto não
serve. Use Netlify ou Cloudflare Pages, que leem o ficheiro `_headers` já
incluído aqui — arrastar a pasta para netlify.com chega.

Cada ficheiro de sessão regista em `ambiente.crossOriginIsolated` se conseguiu,
e o `ler_sessao.py` marca as sessões em que não conseguiu.

## O que a sessão faz

Três níveis, desenhados para **isolar as variáveis** em vez de as misturar.

| Nível | Duração | Rato | Teclado | Obstáculos | O que isola |
|---|---|---|---|---|---|
| **1 — Mira** | ~1 min | sim | não | não | Cinemática pura do rato, sem interferência |
| **2 — Mira e movimento** | 75 s | sim | sim | não | Coordenação rato↔teclado em campo aberto |
| **3 — Mira, movimento e cobertura** | 75 s | sim | sim | **sim** | Movimento reativo sob restrição espacial |

O **nível 1** usa uma sequência fixa de 20 alvos, igual para todos os participantes:
amplitudes angulares de 8°, 16° e 26°, oito direções, dois tamanhos de alvo. É o
bloco que dá a lei de Fitts e o único diretamente comparável entre pessoas.

O **nível 3** tem dois tipos de obstáculo:

- **Sete pilares fixos**, que tapam a linha de vista. Cerca de metade dos alvos
  nasce de propósito atrás deles, e um alvo tapado aparece a cinzento com os
  tiros a não contar. O participante tem de se deslocar para ganhar ângulo.
- **Quatro blocos em movimento**, que atravessam a arena de lado a lado. Tapam
  a linha de vista enquanto passam e **empurram o jogador** se o apanharem
  parado, o que obriga a sair da frente.

Os pilares criam deslocação deliberada; os blocos criam deslocação reativa. São
duas coisas diferentes e juntas geram contra-strafes, mudanças de direção e
toques curtos — exatamente o que faltava.

Cada toque num bloco fica registado como evento `bloco_toque`.

### Porque é que o nível 3 existe

Numa sessão real de teste, no desenho anterior sem obstáculos:

```
0,65 eventos de teclado por segundo
KeyA n=26 · KeyD n=13 · KeyW n=14 · KeyS n=3 · Space n=1
KeyW com dwell mediano de 1382 ms e máximo de 16 484 ms
```

Três amostras do `S` não fazem distribuição nenhuma, e um `W` premido 16
segundos é «andar em frente», não é dinâmica de teclado. Em campo aberto não há
razão para o participante se mexer. Os obstáculos criam essa razão.

Cada nível regista no ficheiro `eventosTeclado` e `teclasPorSegundo`, para que
consiga verificar diretamente se o nível 3 está a cumprir o que promete.

Para mudar as durações, no topo do `<script>`:

```js
const CFG = { calibAlvos: 20, segundosNivel2: 75, segundosNivel3: 75,
              nPilares: 7, nBlocos: 4, limiteArena: 16, ... };
```

## Gamificação

Os três níveis têm pausa e resumo entre eles, o que corta a monotonia sem
encurtar a recolha. A pontuação começa no nível 2.

- **Pontuação** visível no HUD: alvos pequenos valem mais, alvos em movimento
  valem 1,35×, e rapidez multiplica até 3×.
- **Acertos seguidos** dão multiplicador até ×2,0. Falhar corta a sequência.
- **Feedback** em cada acerto: anel a expandir no alvo, pontos a subir, mira a
  mudar de cor. Nada disto mexe na câmara — o traço da mira tem de ficar limpo
  para a análise.
- **Resumo por nível** no ecrã final, com os eventos de teclado de cada um.

Não há tabela de pontuações. Sem servidor, a tabela só existia naquele browser
e para aquela pessoa, o que a tornava inútil para toda a gente menos para quem
testasse várias pessoas no mesmo portátil. Não compensava o peso que
acrescentava ao texto de consentimento.

### O que isto custa em rigor

A pontuação é uma variável experimental, não é decoração. Participantes
motivados jogam de forma diferente de participantes entediados: mais depressa,
com mais erros, a arriscar mais. Isso **está** nos dados e tem de ser dito na
tese. Em contrapartida, um participante entediado ao minuto dois dá-lhe dados
piores do que um empenhado.

O ficheiro regista `eventos[0].gamificacao: true`, para que mais tarde consiga
separar sessões recolhidas com e sem pontuação, se decidir testar o efeito.

**Uma tabela partilhada entre participantes seria outra conversa.** Precisaria
de servidor, voltaria a pôr-lhe responsabilidade de alojamento em cima, e
sobretudo criaria incentivo para alguém usar assistência de mira para chegar ao
topo — o que lhe contaminava a classe humana com amostras automatizadas mal
rotuladas. Se um dia a quiser, conte com esses três problemas.

## O ficheiro de dados

Sai como `sessao_<código>.json.gz` (ou `.json` em browsers sem `CompressionStream`).
Uma sessão completa dá tipicamente 2 a 5 MB em JSON, cerca de 300 KB comprimido.

```jsonc
{
  "schema": "aim-logger-1.0",
  "participante": { "id": "...", "consentimento": {...}, "formulario": {...} },
  "ambiente": {
    "unadjustedMovement": true,   // ← confirme isto: ver nota abaixo
    "crossOriginIsolated": true,  // ← e isto também
    "pointerRawUpdate": true,
    "resolucaoTimer": 0.1,        // granularidade real em ms
    "sensibilidade": 1.2, ...
  },
  "mouse":  [[t_ms, dx, dy, i], ...],       // i = ordem dentro da rajada do frame
  "teclas": [[t_ms, "KeyW", 1|0], ...],     // 1 = premida, 0 = largada
  "vista":  [[t_ms, yaw_rad, pitch_rad]],   // um por frame
  "eventos": [
    { "t": …, "tipo": "nivel_inicio", "nivel": 3, "nome": "Mira, movimento e cobertura",
      "obstaculos": true, "pilares": [{ "x": 5.5, "z": 0.0, "r": 0.72, "h": 3.6 }, …] },
    { "t": …, "tipo": "alvo_aparece", "id": 3, "nivel": 3, "x": …, "y": …, "z": …,
      "raio": 0.42, "movel": false, "tapado": true,
      "posJogador": { "x": 2.1, "z": -4.3 }, "erroAngularInicial": 12.4 },
    { "t": …, "tipo": "disparo", "acertou": true, "alvo": 3,
      "erroGraus": 0.31, "tempoDesdeAparecer": 642.1,
      "tempoDesdePrimeiroMov": 418.7, "nivel": 1, "pontos": 340 },
    { "t": …, "tipo": "disparo", "acertou": false, "nivel": 3,
      "bloqueadoPorPilar": true },
    { "t": …, "tipo": "botao", "estado": "baixo" }
  ]
}
```

### `unadjustedMovement` — verifique sempre

Quando é `true`, os deltas do rato vêm **sem** a curva de aceleração do sistema
operativo. Quando é `false` ou `null`, o browser recusou ou não soube dizer, e o
que está gravado é movimento humano misturado com a aceleração da Microsoft.
Esses dados não são inúteis, mas não são comparáveis com os outros. Registe a
proporção e trate-a como variável de controlo.

Chrome e Edge suportam. Firefox e Safari, à data, não.

### Features que saem daqui

- **Rato:** perfil de velocidade, aceleração, jerk, entropia dos intervalos,
  banda de tremor por análise de frequências nos 8–12 Hz
- **Teclado:** dwell time (keydown→keyup da mesma tecla), flight time
  (keyup→keydown seguinte), sobreposição entre teclas de movimento
- **Vista:** trajetória angular da mira, overshoot, nº de correções, tempo até
  estabilizar sobre o alvo
- **Jogo:** tempo de reação (alvo aparece → primeiro movimento → disparo), erro
  angular de cada disparo, precisão, deriva de tudo isto ao longo da sessão

---

## Privacidade, por construção

Não é uma promessa no texto, é uma propriedade do sistema:

- A página **não consegue** capturar nada fora de si própria. É uma garantia do
  browser, não uma opção do código.
- Só são registadas sete teclas: `W A S D Shift Espaço`. Qualquer outra é
  ignorada antes de chegar a memória. A lista está em `TECLAS_PERMITIDAS`.
- Nenhum texto é registado em lado nenhum.
- O identificador vem de `crypto.getRandomValues`, não deriva de nada do
  participante e não há forma de o reverter.
- Nada é enviado para servidor nenhum. Não há `fetch`, não há analytics, não há
  terceiros.

Isto dá-lhe um argumento forte perante a comissão de ética: com um executável
instalado, "só gravamos teclas de jogo" é uma promessa; aqui é verificável a
partir do código, que cabe num ficheiro.

---

## Se um dia precisar de envio automático

O gancho está no fim do `<script>`. Substituir `descarrega()` por um `fetch`
para um servidor seu. Mas conte com isto: passa a ser responsável pelo
alojamento, pela retenção e por eventuais violações de dados, e isso tem de
entrar no protocolo de ética. A versão com descarregamento evita tudo isso.

---

## Testes

```bash
node teste.js   # percorre os quatro ecrãs e valida o ficheiro exportado
node aim.js     # prova a deteção de acerto e a progressão dos blocos
node shot.js    # imagens dos cinco ecrãs
```

`teste.js` verifica também a privacidade: confirma que só saem teclas da lista
branca e que não existe nenhum campo de texto livre nos eventos.
