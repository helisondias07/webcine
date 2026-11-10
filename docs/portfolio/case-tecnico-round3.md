# Case técnico — WebCineTV (watch-party) — rodada 3

**Status: implementado em branch, ainda não publicado** (`cursor/webcine-ux-improvements-eee2`, [PR 67](https://github.com/helisondias07/webcine/pull/67)).

## Stack verificada no repositório

- Cliente: React 18 + TypeScript + Vite 7 + Mantine 8, Socket.IO client, YouTube IFrame API, HLS.js/dash.js em `import()` dinâmico, WebRTC (screenshare).
- Servidor: Node/Express 5 + Socket.IO (salas), axios só para resolução Reddit (agora com limites).
- Testes: Vitest (109 casos nesta rodada), Playwright 1.61 (Chromium desktop/320/390). CI GitHub Actions: `nodejs.yml` em push/PR para `main` — build + e2e Chromium; **não** é pipeline de deploy. `npm run deploy` aponta para `origin/release`.

```text
[browser] Home (React+Mantine, JS inicial ~140 kB gzip)
    └─ lazy WatchApp (sala)
         ├─ Socket.IO ⇄ Express room (host/seek/tsMap/chat)
         ├─ HTML <video> | YouTube iframe
         └─ HLS/DASH vendors só se a URL for desse tipo
```

## Problema

Três classes de risco no produto real (não cosmética):

1. **Sync:** `Math.max(...Object.values(tsMap))` com mapa vazio vira `-Infinity`; mediana vazia virava `0` e podia seekar late join para o início.
2. **Confiança de URL:** fotos de chat/avatar aceitavam `javascript:`/`data:`; fetch Reddit usava `startsWith("https://reddit.com")` (hostname spoof `reddit.com.attacker.test`) sem timeout/tamanho/redirect.
3. **CI vs WebKit:** o workflow instalava só Chromium mas `npm run test:e2e` incluía `tablet-webkit`. Neste VM a página **crasha** na entrada da sala no WebKit do Playwright; Chromium no mesmo caminho passa.

## Decisão

- Extrair `leaderTimeFromMap` (NaN se não há timestamps finitos); `localSeek` já ignora não-finitos; `canplay` continua usando `videoTS` do host (rodada 2).
- Allowlist compartilhada (`shared/safeUrls.ts`) no cliente e no servidor: picture http(s), imagens de chat por extensão, Reddit/Twitch por hostname, axios 4 s / 256 KiB / 0 redirects, recusar m3u8 fora de hosts Reddit.
- Reconexão: reenviar foto permitida no `connect` (nome/cor já iam; picture não).
- Medir **antes** de otimizar; não fatiar vendors de novo sem ganho de transferência. CI e2e = projetos Chromium (`test:e2e:ci`). WebKit permanece projeto local e **falha de forma visível**.

## Métricas (esta VM, não produção)

Baseline `e800727` vs after, mesmo `npm run build`:

- JS inicial gzip disco: 140109 → 140105 bytes (−4 B).
- First-nav `/` mediana gzip HTTP (n=3): 189261 → 189256 bytes.
- JS lazy gzip: +274 B (código novo da sala).
- Chunks >500 kB: dash/hls **lazy**, inalterados.

Detalhe: [../performance/round3.md](../performance/round3.md).

## Limites

- Sem Lighthouse / sem RUM / sem clientes reais.
- First-nav de `/watch/` sem backend Socket.IO.
- Crash WebKit = Playwright Linux, não laudo de Safari iPad.
- Deploy só quando o dono pedir.

## Bullets de currículo (só o comprovado nesta branch)

1. Implementei medição reproduzível de bundle (raw + gzip) e de transferência da primeira navegação (Chromium, gzip local, mediana de 3) num app React/Vite, distinguindo JS inicial de chunks lazy de players (>500 kB que **não** entram na home).
2. Corrigi o relógio da sala: mapa de timestamps vazio deixava de produzir `-Infinity`/`0`; late join continua no `videoTS` do host (com testes de regressão).
3. Fechei bypass de hostname no fetch Reddit (`startsWith`) e limites de timeout/tamanho/redirect; unifiquei validação de URL de mídia, avatar e imagem de chat no cliente e no servidor.
4. Separei o gate de CI (Chromium) do projeto WebKit, documentando crash de página neste Linux VM em vez de skip/force para ficar verde.
5. Publiquei o case e os CSV/JSON **no repositório da branch**; o conjunto ainda não está em produção.

Não afirmar: milhares de usuários, redução de incidentes, receita, Core Web Vitals de campo, “N% mais rápido” nesta rodada.
