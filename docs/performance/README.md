# Performance e evidências (WebCineTV)

**Implementado em branch, ainda não publicado.** Nada disto foi medido em usuários reais nem em produção.

## Como reproduzir

Mesmo ambiente, build de produção local:

```bash
CI=true NODE_ENV=production npm run build
MEASURE_GIT_SHA=$(git rev-parse HEAD) MEASURE_LABEL=local \
  node scripts/measure-bundle.mjs build docs/performance/local-bundle.json
MEASURE_GIT_SHA=$(git rev-parse HEAD) MEASURE_LABEL=local MEASURE_REPEATS=3 \
  node scripts/measure-first-nav.mjs build docs/performance/local-first-nav.json
```

- `measure-bundle.mjs`: tamanho **raw** e **gzip zlib nível 9** dos JS/CSS em `build/assets`. `initial` = referenciado em `index.html` (`script`, `stylesheet`, `modulepreload`).
- `measure-first-nav.mjs`: Chromium contra um servidor estático local com gzip HTTP nível 6. Mede transferência da primeira navegação (mediana de 3). A rota `/watch/...` **não** sobe o Socket.IO: só assets. CDNs externas são ignoradas. **Não** são Core Web Vitals de usuários reais.

Lighthouse não foi executado nesta rodada (ferramenta não fazia parte do fluxo isolado).

## Rodada 3

| Documento | Conteúdo |
|---|---|
| [round3.md](./round3.md) | Método, SHAs, números, limites |
| [round3-comparison.json](./round3-comparison.json) | Deltas baseline (`e800727`) vs after |
| [round3-baseline-e800727.json](./round3-baseline-e800727.json) / [.csv](./round3-baseline-e800727.csv) | Bundle antes de otimizar |
| [round3-after.json](./round3-after.json) / [.csv](./round3-after.csv) | Bundle depois das correções |
| [round3-first-nav-baseline-e800727.json](./round3-first-nav-baseline-e800727.json) | Transferência HTTP gzip, 3 runs |
| [round3-first-nav-after.json](./round3-first-nav-after.json) | Idem depois |
| [round3-webkit-linux.json](./round3-webkit-linux.json) | Crash tablet-webkit neste VM |

SHA `main` original do play do YouTube: `6586408cf1c128a9ff7cc032e7bc271b904672de`. Não foi refeito o build desse SHA nesta rodada (custo extra sem mudar a conclusão: a divisão HLS/DASH lazy já existia em `e800727`). Ganhos das rodadas 1–2 **não** são atribuídos à rodada 3.
