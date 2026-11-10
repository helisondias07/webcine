# Rodada 3 — bundle, primeira navegação e limites

**Implementado em branch, ainda não publicado.**

## Ambiente (o mesmo para baseline e after)

| Item | Valor |
|---|---|
| OS | linux 6.12.113+ x86_64 |
| Node | v22.23.4 |
| Vite | 7.3.1 (devDependency) |
| Playwright | 1.61.0, Chromium para first-nav |
| Build | `CI=true NODE_ENV=production npm run build` |
| Baseline SHA | `e8007275750ba607f14f3f1c12d74f23c4ee3429` (HEAD da rodada 2, medido **antes** das mudanças desta rodada) |
| After | `5b291c397f3bf729ef865149b5254f2a7a1d0112` (build medido no working tree imediatamente antes deste commit) |
| main (referência, não re-buildado aqui) | `6586408cf1c128a9ff7cc032e7bc271b904672de` |

## O que é “inicial” vs “lazy”

- **Inicial / primeira navegação da home:** `index.html` + JS/CSS apontados por `<script>` e `<link rel="modulepreload|stylesheet">` (React + Mantine). HLS.js, dash.js, mediasoup, chunk `App` da sala e `Debug` **não** entram na home.
- **Sala (`/watch/`):** a home ainda baixa o grafo inicial; em seguida o `import()` de `WatchApp` baixa o chunk `App` (+ socket). Players HLS/DASH só se a mídia for desse tipo.
- Aviso do Vite “chunks > 500 kB”: `dash-vendor` (~992 kB raw / ~305 kB gzip) e `hls-vendor` (~522 kB / ~161 kB gzip). Ambos `initial: false`. Dividir chunk ≠ reduzir JS da primeira pintura.

## Números (bytes)

gzip em disco = zlib nível 9. gzip HTTP na first-nav = nível 6 (por isso JS inicial ~140109 vs ~140335).

| Métrica | Unidade | Baseline e800727 | After rodada 3 | Delta |
|---|---|---:|---:|---:|
| JS inicial raw | bytes | 442334 | 442334 | 0 |
| JS inicial gzip (disco) | bytes | 140109 | 140105 | −4 |
| CSS inicial gzip (disco) | bytes | 34645 | 34645 | 0 |
| JS lazy gzip (disco) | bytes | 694260 | 694534 | +274 |
| HTML+JS+CSS inicial gzip (disco) | bytes | 181578 | 181574 | −4 |
| First-nav `/` mediana transferência (gzip HTTP, n=3) | bytes | 189261 | 189256 | −5 |
| First-nav `/` JS encoded mediana | bytes | 140335 | 140332 | −3 |
| First-nav `/watch/measure-room` mediana (n=3) | bytes | 279866 | 280137 | +271 |

Amostra first-nav `/` baseline (todas as 3 iguais): 7 recursos locais. Maiores: `react-vendor` 65344 encoded, `ui-vendor.js` 64450, `ui-vendor.css` 29926, `index.js` 10541, HTML 6909.

**Conclusão de performance desta rodada: neutra.** Não houve redução material do JS da primeira navegação. O +274 B gzip no JS lazy é o código de validação/sync no chunk da sala. Não inventar meta percentual. Não são Web Vitals de produção.

Não se atribui à rodada 3 a divisão HLS/DASH (já em `e800727` / rodadas anteriores).

## Comandos (sanitizados)

```text
MEASURE_GIT_SHA=e800727… MEASURE_LABEL=round3-baseline-e800727 \
  node scripts/measure-bundle.mjs build docs/performance/round3-baseline-e800727.json
MEASURE_REPEATS=3 node scripts/measure-first-nav.mjs build docs/performance/round3-first-nav-baseline-e800727.json
CI=true NODE_ENV=production npm run build
MEASURE_LABEL=round3-after node scripts/measure-bundle.mjs build docs/performance/round3-after.json
MEASURE_REPEATS=3 node scripts/measure-first-nav.mjs build docs/performance/round3-first-nav-after.json
```

## WebKit (Playwright Linux)

Ver [round3-webkit-linux.json](./round3-webkit-linux.json). Home chega em `/watch/`; ao preencher o nome a página fecha. Chromium no mesmo fluxo passa. Limitação do engine neste VM, não comprovada em iPad Safari real. CI **não** instala WebKit; `npm run test:e2e:ci` roda só Chromium.

## Fora de escopo

- Deploy / produção / Lighthouse de campo
- Analytics/telemetria nova
- Remover `public/screenshot_full.png` (~884 kB): não entra na primeira navegação (não referenciado no código nem no manifest)
