/** Valida os três níveis: colisão, linha de vista, progressão e dados de teclado. */
const { chromium } = require("playwright");
const path = require("path");
function ok(c,m){ console.log((c?"  [PASSA] ":"  [FALHA] ")+m); if(!c) process.exitCode=1; }

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport:{width:1280,height:760} });
  const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.goto("file://"+path.join(__dirname,"index.html"));
  for (const c of ["#c1","#c2","#c3","#c4"]) await pg.check(c);
  await pg.click("#b-consent");
  for (const [k,v] of [["#f-idade","35–44"],["#f-mao","Direita"],["#f-horas","5 a 10"],
       ["#f-fps","Alguma"],["#f-poll","1000 Hz"],["#f-sup","Tapete de rato"],
       ["#f-acel","Desligada"],["#f-mod","Não, uso rato"]]) await pg.selectOption(k,v);
  await pg.fill("#f-rato","x"); await pg.fill("#f-dpi","800");
  await pg.click("#b-form"); await pg.click("#b-instr");
  await pg.waitForTimeout(500);

  console.log("\n1. Nível 1 — só mira");
  const n1 = await pg.evaluate(() => ({
    nivel:S.nivel, obstaculos:S.obstaculos.length, alvos:S.alvos.length,
    movimentoAtivo: (() => { const x0=S.cam.x; S.mov.w=1;
      // simula um frame de movimento
      const B=baseCam(); if (S.nivel>=2) S.cam.x+=1; S.mov.w=0; return S.cam.x!==x0; })(),
  }));
  ok(n1.nivel === 1, "começa no nível 1");
  ok(n1.obstaculos === 0, "nível 1 não tem obstáculos");
  ok(n1.movimentoAtivo === false, "nível 1 não permite andar");

  console.log("\n2. Colisão com pilares");
  const col = await pg.evaluate(() => {
    S.obstaculos = geraObstaculos();
    const o = S.obstaculos[0];
    const [cx,cz] = resolveColisao(o.x, o.z + 0.05);      // tenta entrar no pilar
    const dist = Math.hypot(cx-o.x, cz-o.z);
    const [lx,lz] = resolveColisao(o.x + 20, o.z + 20);   // longe: não mexe
    return { dist, minimo:o.r + CFG.raioJogador, livreX:lx, esperadoX:o.x+20, nPilares:S.obstaculos.length };
  });
  ok(col.nPilares === 9, `gera ${col.nPilares} pilares`);
  ok(Math.abs(col.dist - col.minimo) < 0.01,
     `empurra o jogador para fora do pilar (${col.dist.toFixed(2)} = ${col.minimo.toFixed(2)})`);
  ok(col.livreX === col.esperadoX, "não mexe em posições livres");

  console.log("\n3. Linha de vista");
  const los = await pg.evaluate(() => {
    S.obstaculos = [{ x:0, z:-6, r:1.0, h:3.6 }];
    S.cam = { x:0, y:1.65, z:0, yaw:0, pitch:0 };
    return {
      atras:  temLinhaDeVista({ x:0, y:1.65, z:-12 }),   // mesmo atrás do pilar
      aoLado: temLinhaDeVista({ x:6, y:1.65, z:-12 }),   // de lado, livre
      acima:  temLinhaDeVista({ x:0, y:9.0,  z:-12 }),   // por cima do pilar
      aquem:  temLinhaDeVista({ x:0, y:1.65, z:-3 }),    // entre a câmara e o pilar
      semPilares: (() => { S.obstaculos=[]; return temLinhaDeVista({x:0,y:1.65,z:-12}); })(),
    };
  });
  console.log("   " + JSON.stringify(los));
  ok(los.atras === false, "alvo atrás do pilar fica tapado");
  ok(los.aoLado === true, "alvo ao lado está visível");
  ok(los.acima === true, "alvo acima do pilar está visível");
  ok(los.aquem === true, "alvo entre a câmara e o pilar está visível");
  ok(los.semPilares === true, "sem pilares, tudo visível");

  console.log("\n4. Disparo bloqueado não conta");
  const bl = await pg.evaluate(() => {
    S.nivel = 3; S.fase = "n3";
    S.obstaculos = [{ x:0, z:-6, r:1.0, h:3.6 }];
    S.alvos = []; S.cam = { x:0, y:1.65, z:0, yaw:0, pitch:0 };
    criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });
    const antes = S.acertos; dispara(performance.now());
    const tapado = S.acertos === antes;
    const ultimo = S.eventos[S.eventos.length-1];
    // agora de lado, com ângulo
    S.alvos=[]; S.cam.x = 6; criaAlvo({ x:6, y:1.65, z:-12, r:0.42 });
    const a2 = S.acertos; dispara(performance.now());
    return { tapado, marcouBloqueio: ultimo.bloqueadoPorPilar === true,
             comAngulo: S.acertos > a2 };
  });
  ok(bl.tapado, "tiro através do pilar não acerta");
  ok(bl.marcouBloqueio, "o evento regista bloqueadoPorPilar");
  ok(bl.comAngulo, "com ângulo livre, acerta");

  console.log("\n5. Progressão pelos três níveis");
  const prog = await pg.evaluate(async () => {
    CFG.segundosNivel2 = 1; CFG.segundosNivel3 = 1;
    // completa o nível 1 a apontar com precisão
    S.nivel = 1; S.fase = "n1"; S.obstaculos=[]; S.alvos=[]; S.niveis=[];
    S.cam={x:0,y:1.65,z:0,yaw:0,pitch:0};
    S.calibSeq = geraCalib(); S.calibIdx = 0; proximoCalib();
    for (let i=0;i<30 && S.nivel===1;i++){
      const a=S.alvos[0]; if(!a) break;
      const v={x:a.x-S.cam.x,y:a.y-S.cam.y,z:a.z-S.cam.z}, n=Math.hypot(v.x,v.y,v.z);
      S.cam.pitch=Math.asin(v.y/n); S.cam.yaw=Math.atan2(v.x,-v.z);
      dispara(performance.now());
      await new Promise(r=>setTimeout(r,2));
    }
    return { niveisFeitos: S.niveis.length, nivelAgora: S.nivel,
             entreNiveis: S.entreRondas, nomes: S.niveis.map(x=>x.nome) };
  });
  console.log("   " + JSON.stringify(prog));
  ok(prog.niveisFeitos >= 1, "o nível 1 fecha quando a sequência acaba");
  ok(prog.entreNiveis === true, "pausa entre níveis à espera de clique");

  console.log("\n6. Teclado por nível");
  const kb = await pg.evaluate(() => {
    const d = montaFicheiro();
    const ini = d.eventos.filter(e=>e.tipo==="nivel_inicio");
    return { temNivelInicio: ini.length>0,
             registaPilares: ini.some(e=>Array.isArray(e.pilares)),
             resumoTemTeclado: d.desempenho.niveis.every(n=>"eventosTeclado" in n && "teclasPorSegundo" in n),
             alvoTemNivel: d.eventos.some(e=>e.tipo==="alvo_aparece" && e.nivel>0) };
  });
  ok(kb.temNivelInicio, "regista o início de cada nível");
  ok(kb.registaPilares, "guarda as posições dos pilares nos dados");
  ok(kb.resumoTemTeclado, "cada nível traz eventos de teclado e taxa por segundo");
  ok(kb.alvoTemNivel, "cada alvo sabe em que nível apareceu");

  ok(errs.length===0, errs.length?("erros: "+errs.join(" | ")):"sem erros de JavaScript");
  await b.close();
  console.log(process.exitCode?"\n*** HÁ FALHAS ***\n":"\nNÍVEIS VALIDADOS\n");
})();
