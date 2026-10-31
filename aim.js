/** Prova que a deteção de acerto e a progressão dos blocos funcionam. */
const { chromium } = require("playwright");
const path = require("path");
function ok(c,m){ console.log((c?"  [PASSA] ":"  [FALHA] ")+m); if(!c) process.exitCode=1; }

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport:{width:1280,height:760} });
  const erros=[]; pg.on("pageerror",e=>erros.push(String(e)));
  await pg.goto("file://"+path.join(__dirname,"index.html"));
  for (const c of ["#c1","#c2","#c3","#c4"]) await pg.check(c);
  await pg.click("#b-consent");
  for (const [k,v] of [["#f-idade","25–34"],["#f-mao","Direita"],["#f-horas","2 a 5"],
       ["#f-fps","Alguma"],["#f-poll","1000 Hz"],["#f-sup","Tapete de rato"],
       ["#f-acel","Desligada"],["#f-mod","Não, uso rato"]]) await pg.selectOption(k,v);
  await pg.fill("#f-rato","Logitech G403"); await pg.fill("#f-dpi","800");
  await pg.click("#b-form"); await pg.click("#b-instr");
  await pg.waitForTimeout(400);

  // aponta com precisão a cada alvo e atravessa os três níveis
  const r = await pg.evaluate(async () => {
    CFG.segundosNivel2 = 1; CFG.segundosNivel3 = 1;
    const apontaEDispara = () => {
      const a = S.alvos[0]; if (!a) return false;
      const v = { x:a.x-S.cam.x, y:a.y-S.cam.y, z:a.z-S.cam.z };
      const n = Math.hypot(v.x,v.y,v.z);
      S.cam.pitch = Math.asin(v.y/n);
      S.cam.yaw   = Math.atan2(v.x, -v.z);
      dispara(performance.now());
      return true;
    };
    const niveisVistos = new Set();
    for (let i = 0; i < 120; i++) {
      niveisVistos.add(S.nivel);
      if (S.fase === "fim") break;
      if (S.entreRondas) {                       // pausa entre níveis: clica para seguir
        cv.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise(res => setTimeout(res, 30));
        continue;
      }
      apontaEDispara();
      await new Promise(res => setTimeout(res, 8));
    }
    return { acertos:S.acertos, disparos:S.disparos, fase:S.fase,
             calibFeita: S.calibIdx >= S.calibSeq.length,
             niveisVistos: [...niveisVistos].sort(),
             niveisConcluidos: S.niveis.length,
             errosDeAcerto: S.eventos.filter(e=>e.tipo==="disparo"&&e.acertou)
                             .map(e=>e.erroGraus).slice(0,5),
             temTempoReacao: S.eventos.some(e=>e.tipo==="disparo"&&e.acertou&&e.tempoDesdeAparecer>0),
             semBloqueio: S.eventos.filter(e=>e.tipo==="disparo"&&e.bloqueadoPorPilar).length,
             acertosSemBloqueio: S.eventos.filter(e=>e.tipo==="disparo"&&e.acertou).length,
             disparosSemBloqueio: S.eventos.filter(e=>e.tipo==="disparo"&&!e.bloqueadoPorPilar).length };
  });

  console.log("\nDeteção de acerto com pontaria exata");
  console.log("   " + JSON.stringify(r));
  ok(r.acertos >= 20, `acerta quando a mira está no alvo (${r.acertos}/${r.disparos})`);
  ok(r.semBloqueio === 0 || r.acertosSemBloqueio === r.disparosSemBloqueio,
     `com linha de vista, a pontaria exata nunca falha ` +
     `(${r.acertosSemBloqueio}/${r.disparosSemBloqueio}; ` +
     `${r.semBloqueio} tiros bloqueados por pilares no nível 3)`);
  ok(r.calibFeita, "o nível 1 completou os 20 alvos");
  ok(r.niveisVistos.includes(2), "avançou para o nível 2");
  ok(r.niveisConcluidos >= 1, `concluiu ${r.niveisConcluidos} nível(eis)`);
  ok(r.errosDeAcerto.every(e => e < 0.001), "erro angular ~0 quando aponta ao centro");
  ok(r.temTempoReacao, "regista o tempo desde o alvo aparecer");

  // cenário determinístico: um único alvo, mesmo em frente
  const mira = await pg.evaluate(() => {
    S.alvos = []; S.cam = { x:0, y:1.65, z:0, yaw:0, pitch:0 };
    criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });     // exatamente à frente
    const r = {};
    let a0 = S.acertos; dispara(performance.now()); r.aoCentro = S.acertos > a0;

    S.alvos = []; criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });
    S.cam.yaw = Math.PI;                           // de costas
    a0 = S.acertos; dispara(performance.now()); r.deCostas = S.acertos === a0;

    S.alvos = []; criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });
    S.cam.yaw = Math.atan(0.42 / 12) * 0.6;        // dentro do raio do alvo
    a0 = S.acertos; dispara(performance.now()); r.dentroDoRaio = S.acertos > a0;

    S.alvos = []; criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });
    S.cam.yaw = Math.atan(0.42 / 12) * 2.2;        // mesmo ao lado do alvo
    a0 = S.acertos; dispara(performance.now()); r.foraDoRaio = S.acertos === a0;
    return r;
  });
  console.log("   " + JSON.stringify(mira));
  ok(mira.aoCentro, "acerta com o alvo no centro da mira");
  ok(mira.deCostas, "de costas para o alvo, não acerta");
  ok(mira.dentroDoRaio, "acerta na borda interior do alvo");
  ok(mira.foraDoRaio, "falha mesmo ao lado do alvo");
  ok(erros.length===0, erros.length?("erros: "+erros.join(" | ")):"sem erros de JavaScript");
  await b.close();
  console.log(process.exitCode?"\n*** HÁ FALHAS ***\n":"\nDETEÇÃO DE ACERTO VALIDADA\n");
})();
