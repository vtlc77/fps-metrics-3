/**
 * Teste automático do instrumento de recolha.
 * Percorre os quatro ecrãs, joga a sessão com rato e teclado sintéticos,
 * e valida o ficheiro de dados que sai no fim.
 */
const { chromium } = require("playwright");
const path = require("path");

const URL = "file://" + path.join(__dirname, "index.html");

function ok(cond, msg) {
  console.log((cond ? "  [PASSA] " : "  [FALHA] ") + msg);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const erros = [];
  pg.on("pageerror", e => erros.push(String(e)));
  pg.on("console", m => { if (m.type() === "error") erros.push(m.text()); });

  await pg.goto(URL);
  console.log("\n1. Consentimento");
  ok(await pg.isVisible("#aviso-preencher"), "avisa que faltam campos por preencher");
  ok(await pg.isDisabled("#b-consent"), "botão bloqueado antes de aceitar");
  for (const c of ["#c1", "#c2", "#c3", "#c4"]) await pg.check(c);
  ok(await pg.isEnabled("#b-consent"), "botão liberta com as quatro caixas");
  await pg.click("#b-consent");

  console.log("\n2. Formulário");
  ok(await pg.isVisible("#t-form"), "avança para o formulário");
  ok(await pg.isDisabled("#b-form"), "botão bloqueado com o formulário vazio");
  await pg.selectOption("#f-mod", "Sim, touchpad");
  await pg.waitForTimeout(60);
  ok(await pg.isVisible("#av-touchpad"), "deteta touchpad e avisa");
  await pg.selectOption("#f-idade", "25–34");
  await pg.selectOption("#f-mao", "Direita");
  await pg.selectOption("#f-horas", "2 a 5");
  await pg.selectOption("#f-fps", "Alguma");
  await pg.fill("#f-rato", "Logitech G403");
  await pg.fill("#f-dpi", "800");
  await pg.selectOption("#f-poll", "1000 Hz");
  await pg.selectOption("#f-sup", "Tapete de rato");
  await pg.selectOption("#f-acel", "Desligada");
  ok(await pg.isDisabled("#b-form"), "continua bloqueado enquanto for touchpad");
  await pg.selectOption("#f-mod", "Não, uso rato");
  await pg.waitForTimeout(60);
  ok(await pg.isEnabled("#b-form"), "liberta quando o dispositivo é um rato");
  await pg.click("#b-form");

  console.log("\n3. Instruções e arranque");
  ok(await pg.isVisible("#t-instr"), "mostra as instruções");
  await pg.click("#b-instr");
  await pg.waitForTimeout(500);
  ok(await pg.isVisible("#jogo"), "entra no jogo");

  // encurta o bloco livre para o teste não demorar três minutos
  await pg.evaluate(() => { window.__S = null; });
  await pg.evaluate(`CFG.segundosNivel2 = 3; CFG.segundosNivel3 = 3;`).catch(() => {});

  console.log("\n4. Sessão simulada");
  // varre o rato em arco e dispara, repetidamente
  for (let volta = 0; volta < 24; volta++) {
    for (let i = 0; i < 14; i++) {
      await pg.mouse.move(640 + Math.sin(volta + i / 3) * 170, 380 + Math.cos(volta / 2 + i / 4) * 95);
    }
    await pg.keyboard.down("KeyW");
    await pg.mouse.down(); await pg.mouse.up();
    await pg.keyboard.up("KeyW");
    if (volta % 7 === 0) { await pg.keyboard.down("KeyA"); await pg.keyboard.up("KeyA"); }
  }
  await pg.waitForTimeout(400);

  const est = await pg.evaluate(() => ({
    fase: S.fase, mouse: S.mouse.length, teclas: S.teclas.length,
    vista: S.vista.length, eventos: S.eventos.length,
    disparos: S.disparos, acertos: S.acertos, calibIdx: S.calibIdx,
  }));
  console.log("   estado:", JSON.stringify(est));
  ok(est.mouse > 500, `regista amostras do rato (${est.mouse})`);
  ok(est.teclas >= 4, `regista eventos de teclado (${est.teclas})`);
  ok(est.vista > 50, `regista a orientação da vista por frame (${est.vista})`);
  ok(est.disparos > 20, `regista disparos (${est.disparos})`);
  ok(est.calibIdx > 0, "o nível 1 avançou");

  console.log("\n5. Ficheiro de dados");
  const f = await pg.evaluate(() => {
    terminar();
    const d = montaFicheiro();
    return {
      schema: d.schema,
      temId: !!d.participante.id && d.participante.id.length === 16,
      temConsent: !!d.participante.consentimento.em,
      formCompleto: Object.values(d.participante.formulario).every(v => v !== ""),
      nMouse: d.mouse.length, nTeclas: d.teclas.length, nEventos: d.eventos.length,
      amostra: d.mouse[10],
      tecla: d.teclas[0],
      tiposEvento: [...new Set(d.eventos.map(e => e.tipo))],
      unadjusted: d.ambiente.unadjustedMovement,
      resolucaoTimer: d.ambiente.resolucaoTimer,
      temDisparoComErro: d.eventos.some(e => e.tipo === "disparo" && typeof e.erroGraus === "number"),
      temAlvoComGroundTruth: d.eventos.some(e => e.tipo === "alvo_aparece" && typeof e.erroAngularInicial === "number"),
      bytes: JSON.stringify(d).length,
    };
  });
  console.log("   ficheiro:", JSON.stringify(f, null, 1).replace(/\n\s*/g, " "));
  ok(/^aim-logger-\d+\.\d+$/.test(f.schema), `tem versão de schema (${f.schema})`);
  ok(f.temId, "tem identificador anónimo de 16 hex");
  ok(f.temConsent, "regista o momento do consentimento");
  ok(f.formCompleto, "guarda o formulário completo");
  ok(Array.isArray(f.amostra) && f.amostra.length === 4,
     "amostras do rato no formato [t,dx,dy,ordem-na-rajada]");
  ok(Array.isArray(f.tecla) && f.tecla.length === 3, "teclas no formato [t,code,estado]");
  ok(f.temDisparoComErro, "cada disparo traz o erro angular");
  ok(f.temAlvoComGroundTruth, "cada alvo traz a posição e o erro inicial");
  ok(f.tiposEvento.includes("sessao_inicio") && f.tiposEvento.includes("nivel_inicio"),
     "marca o início da sessão e dos níveis");
  console.log("   tipos de evento:", f.tiposEvento.join(", "));
  console.log("   tamanho em JSON:", (f.bytes / 1024).toFixed(0), "KB");

  console.log("\n6. Privacidade");
  const priv = await pg.evaluate(() => {
    const d = montaFicheiro();
    const txt = JSON.stringify(d);
    return {
      semTexto: !d.eventos.some(e => "texto" in e || "chave" in e),
      codigosTeclas: [...new Set(d.teclas.map(t => t[1]))],
    };
  });
  const permitidas = ["KeyW","KeyA","KeyS","KeyD","ShiftLeft","ShiftRight","Space"];
  ok(priv.codigosTeclas.every(c => permitidas.includes(c)),
     "só regista teclas da lista branca: " + priv.codigosTeclas.join(", "));
  ok(priv.semTexto, "não existe nenhum campo de texto livre nos eventos");

  console.log("\n7. Gamificação");
  const g = await pg.evaluate(() => {
    S.nivel = 2; S.fase = "n2"; S.pontos = 0; S.sequencia = 0;
    S.alvos = []; S.obstaculos = []; S.blocos = [];
    S.cam = { x:0, y:1.65, z:0, yaw:0, pitch:0 };
    const pontosPorAcerto = [];
    for (let i = 0; i < 4; i++) {
      criaAlvo({ x:0, y:1.65, z:-12, r:0.42 });
      const antes = S.pontos;
      dispara(performance.now());
      pontosPorAcerto.push(S.pontos - antes);
    }
    const comSequencia = S.pontos, seqAlta = S.sequencia;
    S.alvos = []; S.cam.yaw = Math.PI; dispara(performance.now());
    const d = montaFicheiro();
    return { pontosPorAcerto, comSequencia, seqAlta, seqDepoisDeFalhar: S.sequencia,
             temDesempenho: !!d.desempenho, pontosNoFicheiro: d.desempenho.pontos,
             semAlcunha: !JSON.stringify(d).includes("alcunha"),
             efeitosCriados: S.efeitos.length > 0 };
  });
  console.log("   " + JSON.stringify(g));
  ok(g.comSequencia > 0, `pontuação acumula (${g.comSequencia} pontos)`);
  ok(g.pontosPorAcerto[3] > g.pontosPorAcerto[0],
     `acertos seguidos valem mais (${g.pontosPorAcerto[0]} -> ${g.pontosPorAcerto[3]})`);
  ok(g.seqAlta === 4, "conta a sequência de acertos");
  ok(g.seqDepoisDeFalhar === 0, "falhar corta a sequência");
  ok(g.temDesempenho && g.pontosNoFicheiro > 0, "o ficheiro regista a pontuação");
  ok(g.semAlcunha, "não existe vestígio de alcunha no ficheiro");
  ok(g.efeitosCriados, "gera feedback visual nos acertos");

  const semTabela = await pg.evaluate(() => ({
    semElemento: !document.getElementById("tabela") && !document.getElementById("f-alcunha"),
    semStorage: localStorage.getItem("aim-tabela-v1") === null,
    temEmail: document.body.innerHTML.includes("50056610@europeia.pt"),
    semPorPreencher: !document.body.innerHTML.includes("[A PREENCHER: email"),
  }));
  ok(semTabela.semElemento, "a tabela de pontuações foi removida da página");
  ok(semTabela.semStorage, "não escreve nada em localStorage");
  ok(semTabela.temEmail, "o email da universidade está na página");

  console.log("\n8. Ecrã final");
  ok(await pg.isVisible("#t-fim"), "mostra o ecrã de fim");
  ok((await pg.textContent("#resumo")).includes("Código anónimo"), "mostra o código ao participante");

  console.log("\n9. Erros de consola");
  ok(erros.length === 0, erros.length ? "erros: " + erros.join(" | ") : "nenhum erro de JavaScript");

  await pg.screenshot({ path: "shot-jogo.png" });
  await browser.close();
  console.log(process.exitCode ? "\n*** HÁ FALHAS ***\n" : "\nTODOS OS TESTES PASSARAM\n");
})();
