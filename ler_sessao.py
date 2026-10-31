#!/usr/bin/env python3
"""
Lê um ficheiro de sessão e mostra um resumo.
Serve para confirmar que o ficheiro de um participante está bom antes de o
juntar ao conjunto de dados.

    python3 ler_sessao.py sessao_a1b2c3d4e5f6a7b8.json.gz
"""
import sys, json, gzip, pathlib
from collections import Counter


def carrega(caminho):
    p = pathlib.Path(caminho)
    abrir = gzip.open if p.suffix == ".gz" else open
    with abrir(p, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def main(caminho):
    d = carrega(caminho)
    amb, part = d["ambiente"], d["participante"]
    mouse, teclas, eventos = d["mouse"], d["teclas"], d["eventos"]

    print(f"\nFicheiro   {pathlib.Path(caminho).name}")
    print(f"Versão     {d['schema']}")
    print(f"Código     {part['id']}")
    print(f"Consentido {part['consentimento']['em']}")

    print("\n--- Qualidade da recolha " + "-" * 40)
    ua = amb["unadjustedMovement"]
    marca = "OK " if ua is True else "!! "
    print(f" {marca}unadjustedMovement: {ua}"
          + ("" if ua is True else "   <-- deltas contaminados pela aceleração do SO"))
    print(f"    pointerRawUpdate:   {amb['pointerRawUpdate']}")

    coi = amb.get("crossOriginIsolated")
    marca = "OK " if coi is True else "!! "
    print(f" {marca}crossOriginIsolated: {coi}"
          + ("" if coi is True else "   <-- relógio arredondado; ver cabeçalhos COOP/COEP"))
    print(f"    resolução do timer: {amb['resolucaoTimer']} ms")
    print(f"    sensibilidade:      {amb['sensibilidade']}")

    if mouse:
        dur = (mouse[-1][0] - mouse[0][0]) / 1000
        taxa = len(mouse) / dur if dur else 0
        print(f"    amostras do rato:   {len(mouse):,} em {dur:.0f} s  ({taxa:.0f} Hz médios)")

        # quantos instantes distintos existem, e que fração das amostras os partilha
        ts = [m[0] for m in mouse]
        distintos = len(set(ts))
        colididas = 1 - distintos / len(ts)
        inteiros = all(float(x).is_integer() for x in ts[:2000])
        print(f"    instantes distintos: {distintos:,}  "
              f"({colididas*100:.0f} % das amostras partilham timestamp)")
        if inteiros:
            print("    !! timestamps são inteiros de ms: o relógio foi arredondado")
        if colididas > 0.15:
            print("    !! muitas amostras no mesmo instante: a ordem dentro da rajada")
            print("       está no 4.º valor, mas o tempo real entre elas perdeu-se")
        if taxa < 100:
            print("    !! taxa baixa: confirme o rato e o browser do participante")

    print("\n--- Participante " + "-" * 47)
    for k, v in part["formulario"].items():
        print(f"    {k:16s} {v}")

    print("\n--- Conteúdo " + "-" * 51)
    print(f"    eventos de teclado: {len(teclas)}  "
          f"({', '.join(sorted({t[1] for t in teclas})) or 'nenhum'})")
    print(f"    amostras de vista:  {len(d['vista']):,}")
    tipos = Counter(e["tipo"] for e in eventos)
    for t, n in tipos.most_common():
        print(f"    {t:16s} {n}")

    disparos = [e for e in eventos if e["tipo"] == "disparo"]
    acertos = [e for e in disparos if e.get("acertou")]
    if disparos:
        print(f"\n    precisão: {len(acertos)}/{len(disparos)} "
              f"({100*len(acertos)/len(disparos):.0f} %)")
    calib = [e for e in acertos if e.get("fase") == "calib" and e.get("tempoDesdeAparecer")]
    if calib:
        ts = sorted(e["tempoDesdeAparecer"] for e in calib)
        med = ts[len(ts) // 2]
        print(f"    tempo até acertar na calibração: mediana {med:.0f} ms "
              f"(min {ts[0]:.0f}, max {ts[-1]:.0f})")

    print("\n--- Veredito " + "-" * 51)
    problemas = []
    if ua is not True:
        problemas.append("aceleração do SO não foi desligada")
    if amb.get("crossOriginIsolated") is not True:
        problemas.append("relógio arredondado: timing do rato degradado")
    if mouse and (mouse[-1][0] - mouse[0][0]) / 1000 < 120:
        problemas.append("sessão demasiado curta")
    if len(acertos) < 15:
        problemas.append("poucos acertos, participante pode ter desistido")
    if not calib:
        problemas.append("bloco de calibração não foi completado")
    if problemas:
        for p_ in problemas:
            print(f"    !! {p_}")
        print("\n    -> usável com reservas; registe estas notas\n")
    else:
        print("    sem problemas detetados\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
