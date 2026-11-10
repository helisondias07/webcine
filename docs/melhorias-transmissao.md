# Melhorias da transmissão (duas pessoas)

Auditoria de 24 de outubro de 2026. Estado lido: `main` em `6bec237` mais o PR aberto [#65](https://github.com/helisondias07/webcine/pull/65) (`cursor/screenshare-audio-quality-ed38`). Este documento é só recomendação. Nenhum código de transmissão foi alterado aqui.

## Resumo

O WebCineTV é uma sala para duas pessoas assistirem juntas, em geral com uma aba compartilhada (ele transmite, ela assiste). O que importa é a imagem ficar nítida, o som da aba continuar depois de vários F5 e a conexão se refazer sozinha. O desenho certo para isso é uma conexão WebRTC direta entre os dois, com TURN só quando a rede exige.

O [WatchParty](https://github.com/howardchung/watchparty) é a base de onde o projeto saiu, e o sync de play/pause/seek ainda vem de lá. Para qualidade de tela e áudio ele é uma referência fraca: captura em 720p com `logicalSurface: true` e reescreve o SDP de áudio para `multiopus` a 510 kbps. O WebCine já passou disso. As técnicas que ainda valem a pena estão no [LiveKit](https://github.com/livekit/client-sdk-js) (preset de áudio de música e bitrate de tela 1080p30), no [Jitsi](https://github.com/jitsi/lib-jitsi-meet) (`maintain-resolution` e Opus estéreo sem trocar o codec) e no [Screego](https://github.com/screego/server) (áudio de sistema sem cancelamento de eco). O Screego também serve de contraexemplo: sem `maxBitrate` o Chrome fica em torno de 300 kbps ([issue 221](https://github.com/screego/server/issues/221)).

O próximo passo de produto é entrar o PR #65 e, em seguida, subir a qualidade do Opus da aba sem repetir o `multiopus` que já deixou o som mudo.

## Como a transmissão funciona hoje

Uma sala é um namespace Socket.IO (`server/room.ts`). Quem compartilha publica `screenshare://{clientId}` e manda a mídia em peer connections diretas. A sinalização é o evento `signalSS` (offer, answer, ICE, `reset`, `resync`). O coturn entra por `GET /webrtc/ice` (`server/server.ts`), com usuário HMAC e TTL padrão de 3600 s (`server/config.ts`). Sem `MEDIASOUP_SERVER` não há SFU — e para duas pessoas isso é o caminho certo.

A captura, o bitrate e a recuperação estão separados de `src/components/App/App.tsx`:

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Pedido de captura | `src/components/App/screenshare/capture.ts` | Desktop pede 1080p30 e áudio sem AGC/eco/ruído. Celular pede só `{ video: true }`, porque o navegador não captura o áudio de outro app. |
| Perfil de encode | `src/components/App/screenshare/quality.ts` | Teto de 5 Mbps por espectador em auto, 1080p30, `contentHint` `motion` (filme). Economia é 720p e vale só para quem pediu. |
| Reconexão | `src/components/App/screenshare/reconnect.ts` | ICE restart com espera de 4/8/15 s. Recria a conexão até 6 vezes. Tira `a=extmap-allow-mixed` do offer (Safari). |
| Áudio remoto | `src/components/App/screenshare/remoteStream.ts` | Novo `MediaStream` quando a faixa de áudio chega depois do vídeo. Detecta contador de áudio parado. |
| Faixas por peer | `src/components/App/screenshare/publish.ts` (só no PR #65) | Clona vídeo e áudio para cada peer. Fechar a conexão de quem deu F5 não mata a captura do outro. |
| UI de som | `App.tsx` + `Controls.tsx` | “Ativar som” / “Recuperar som” depois do F5. O Chrome exige um gesto novo em cada carga. |

O PR #65, ainda aberto, fecha o ciclo que o casal está sentindo:

- O roster ganha um `epoch` por conexão. Quando a outra pessoa atualiza a página, quem transmite fecha só aquela peer connection e manda um offer novo.
- `negotiationneeded` no meio de um offer entra numa fila, em vez de ser ignorado. O Chrome não dispara o evento de novo, então uma faixa de áudio atrasada sumia.
- Áudio “vivo” porém parado (contador congelado) pede reenvio, até 4 vezes. No `main` isso só acontece se a faixa não existir, e para em 2 tentativas.
- A captura pede pixel de dispositivo (`logicalSurface: false`), com teto 1080p30. O encoder fica em `maintain-resolution`. Um F5 deixa de ser tratado como perda e de empurrar a imagem para ~540p.
- Quem transmite e atualiza a própria aba sai da transmissão. A captura não sobrevive a um reload. Isso é limite do navegador.

## O que o WebCine já faz melhor

- Bitrate explícito de 5 Mbps / 1080p30 para filme. O preset `ScreenSharePresets.h1080fps30` do LiveKit é o mesmo teto (5 Mbps). O WatchParty pede `height: 720` e `logicalSurface: true`. O Screego não define bitrate.
- `contentHint: "motion"` em aba, janela e monitor (`getShareContentHint` em `quality.ts`). O Jitsi histórico marca área de trabalho como `detail`, o que segura texto e derruba quadro. Para filme, `motion` é a escolha certa.
- Áudio de aba sem processamento de voz, igual à ideia do Screego (`echoCancellation`, `autoGainControl` e `noiseSuppression` desligados) e do áudio estéreo do Jitsi.
- Recuperação de F5, medidor de áudio, coturn com segredo temporário, layout de toque e testes (Vitest em `screenshare/` e Playwright em `tests/e2e/screenshare-recovery.spec.ts`). O WatchParty não tem suíte de teste. O CI do WebCine roda unitário, CORS, build e, em pull request, o E2E (`.github/workflows/nodejs.yml`).
- PWA que não guarda Socket.IO nem `/webrtc/ice` (`public/sw.min.js`). HTML é rede primeiro. O worker troca de versão a cada build (`skipWaiting`).
- Interface em pt-BR, Mantine, tema e “Me surpreenda”. Isso fica.

## Prioridade

Esforço: **S** cabe num PR pequeno e dá para provar com os dois Chromes; **M** mexe em sinalização ou em mais de um arquivo e pede teste manual de sessão; **L** é outro serviço ou uma reescrita.

| Prioridade | Área | Gap | Benefício | Esforço | Sugestão concreta |
| --- | --- | --- | --- | --- | --- |
| P0 | Áudio e imagem depois do F5 | No `main`, o mesmo `clientId` reaproveita a peer connection antiga. O Chrome responde o offer com áudio `inactive`. A mesma faixa de áudio entra em mais de uma conexão e morre quando uma delas fecha. `logicalSurface: true` e `degradationPreference: "balanced"` amolecem a imagem para os dois. O PR #65 corrige isso e ainda não está no `main`. | Som e 1080p voltam depois de vários F5 sem a pessoa que transmite parar e iniciar de novo. | S | Entrar o [#65](https://github.com/helisondias07/webcine/pull/65). Arquivos: `server/room.ts` (`epoch`), `screenshare/publish.ts`, `quality.ts`, `remoteStream.ts` (`shareAudioNeedsResync`), `reconnect.ts`, `App.tsx`, `tests/e2e/screenshare-recovery.spec.ts`. |
| P0 | Volume e estéreo do filme | A captura pede `channelCount` ideal 2, mas o SDP do Opus segue o padrão do navegador (em geral mono, ~32 kbps, e o DTX pode cortar trecho quieto da trilha). O WatchParty faz `replace` de `useinbandfec=1` por `stereo=1; maxaveragebitrate=510000` e ainda troca `opus/48000/2` por `multiopus/48000/6` (`App.tsx` do WatchParty, handler de `signalSS`). O WebCine tirou o `multiopus` de propósito: o comentário em `App.tsx` (`signalSS`) registra som mudo intermitente no Chromium de celular. | Trilha com corpo, em estéreo, sem reabrir o bug do silêncio. | M | Helper novo em `src/components/App/screenshare/`, aplicado no **answer**, só na linha `fmtp` do Opus já negociado. Alvo no estilo Jitsi / preset `musicHighQualityStereo` do LiveKit (`src/room/track/options.ts`: 128 kbps): `stereo=1`, `useinbandfec=1`, `usedtx=0`, `maxaveragebitrate=128000`. Manter o codec `opus/48000/2`. Teste unitário da string SDP. Provar em dois Chromes desktop, com um F5 no meio, que o áudio continua. |
| P1 | Relay numa sessão longa | `TURN_TTL_SECONDS` é 3600. `loadTurnCredentials` em `App.tsx` busca `/webrtc/ice` uma vez. O usuário do coturn embute a expiração (`server/server.ts`). Um filme de duas horas, ou um ICE restart depois dessa hora, pode perder o relay justo quando os dois estão em operadoras diferentes. Dois computadores na mesma rede quase não usam TURN; o caso que dói é o celular. | A segunda metade do filme e o F5 tardio continuam com caminho de relay. | S | Subir o TTL para algo como 4–6 h em `server/config.ts` e voltar a buscar `/webrtc/ice` antes de expirar (e ao voltar para a aba). Aplicar com `setConfiguration` nas peer connections ainda abertas. Conferir no `chrome://webrtc-internals` que o par candidato segue `relay` quando a rede exige. |
| P1 | Checkbox de áudio da aba | `getDisplayMediaRequest` em `capture.ts` não pede `systemAudio: "include"` nem favorece a superfície `browser`. Quem transmite esquece “Compartilhar áudio da guia” e a sala fica muda com imagem boa. O LiveKit expõe `systemAudio` em `ScreenShareCaptureOptions`; o Jitsi faz o mesmo em `ScreenObtainer`. | O seletor do Chrome oferece áudio do sistema/aba com mais clareza. | S | Acrescentar `systemAudio: "include"` só no pedido desktop de `capture.ts`, com o pedido atual de fallback se o `getDisplayMedia` rejeitar a constraint. Deixar `suppressLocalAudioPlayback` desligado: quem transmite precisa continuar ouvindo o filme nas próprias caixas. |
| P1 | Imagem congelada | `shareAudioNeedsResync` (PR #65) olha faixa de áudio e `totalSamplesReceived`. Não olha `framesDecoded` / `freezeCount` do vídeo. Dá para o som voltar e a imagem ficar no último quadro. | Quem assiste pede um offer novo quando o vídeo trava, no mesmo ritmo do áudio (teto de 4, espera de 5 s em `handleResyncRequest`). | M | Estender `remoteStream.ts` com um helper no formato de `shareAudioNeedsResync` e chamá-lo do mesmo timer de `scheduleAudioCheck` em `App.tsx`. Ignorar amostra enquanto `connectionState !== "connected"`, como o PR #65 já faz para não baixar o bitrate num F5. |
| P2 | Sync de YouTube e arquivo | O `tsMap` do WebCine sai a cada 2 s (`server/room.ts`), mas `setTimestamp` ainda soma `+ 1`, comentário herdado do WatchParty, cujo intervalo é 1 s. Não há barra de buffer nem botão Sync (o WatchParty tem os dois em `Controls.tsx`). Play/pause/seek e a contagem regressiva já existem. Compartilhamento de tela não usa esse relógio (`hasDuration` / `isPauseDisabled`). | Menos deriva quando os dois assistem um YouTube em vez de uma aba. | M | Só se a sala passar a usar YouTube com frequência. Ajustar o `+ 1` para o intervalo real e cobrir com teste em `server/`. A barra do WatchParty é referência opcional, não parte da transmissão. |
| P2 | Arquivo que o navegador não toca | O WatchParty converte MKV/AC-3 no aparelho com `mediabunny` (`src/utils/clientTranscode.ts`) antes do `captureStream`. O WebCine avisa que MP4/WebM são o caminho feliz (`FileShareModal.tsx`) e não converte. | Um arquivo local toca sem instalar nada. | L | Deixar para quando um arquivo real falhar. Não colocar isso na frente do áudio da aba. |
| P2 | Tamanho de `App.tsx` | ~4700 linhas concentram socket, players e WebRTC. A parte de tela já começou a sair para `screenshare/`. | O próximo ajuste de áudio não nasce dentro do componente. | M | Na hora de mexer no Opus ou no watchdog, o helper nasce em `screenshare/` com Vitest, no estilo de `publish.ts` e `remoteStream.ts`. |

## Cinco ganhos curtos e o que deixar para depois

Ganhos curtos, nesta ordem:

1. Entrar o PR #65 e repetir o roteiro de dois Chromes que já está na descrição do PR (F5 três vezes em quem assiste, “Ativar som” após cada carga, aba 1080p, modo economia só no menu de quem assiste).
2. Helper de Opus a 128 kbps, estéreo, FEC ligado, DTX desligado, sem `multiopus`, com teste da string SDP.
3. TTL do TURN mais longo e nova busca de credencial antes de expirar.
4. `systemAudio: "include"` no pedido desktop, com fallback para o pedido atual.
5. Watchdog de `framesDecoded` ao lado do watchdog de áudio.

Apostas grandes, fora desta fila:

- Subir um SFU MediaSoup para duas pessoas. O gancho `MEDIASOUP_SERVER` já existe para uma sala maior. Um salto a mais de servidor piora latência e dá outro lugar para o áudio quebrar.
- Simulcast ou SVC. O LiveKit oferece camadas; o Jitsi chegou a desligar simulcast na área de trabalho. Para um único espectador, uma encode de 1080p30 é mais simples e mais nítida.
- Fazenda de navegador virtual (neko, Hetzner, DigitalOcean, Scaleway, `server/vm/`, `vmWorker.ts`). O cliente do WebCine nem chama isso. A UI está morta (`{false ? … "Navegador virtual…" : ""}` em `App.tsx`).
- Chat de câmera, reações, emoji, legendas OpenSubtitles, Firebase, Stripe, bot do Discord. O WatchParty tem. A sala a dois não precisa.
- Presets de tela a 5 ou 15 fps do LiveKit (`h720fps5`, `h1080fps15`). Servem para slide. Filme pede 30 fps, que o WebCine já pede.

## O que deixar de fora

- Reescrever Opus para `multiopus` ou usar `maxaveragebitrate=510000`, como o WatchParty. O número é alto demais para uma trilha estéreo e a troca de codec já produziu silêncio.
- Voltar a `logicalSurface: true` ou a `degradationPreference: "balanced"` / `"maintain-framerate"` com link saudável. Foi o que amoleceu a imagem. O PR #65 trava em `maintain-resolution` e só reduz bitrate quando a perda é real.
- `suppressLocalAudioPlayback`. Quem transmite deixa de ouvir o próprio filme.
- `contentHint: "detail"` como padrão. Segura texto e sacrifica movimento. O override manual pode existir; o padrão de cinema continua `motion`.
- Mesh de câmera (`VideoChat.tsx` do WatchParty, evento `signal`). É outra malha WebRTC em cima da que acabou de ser estabilizada.
- Login Firebase, assinatura Stripe, salas “Plus”, limite de assinante e o relay pago. O WebCine identifica a pessoa pelo `clientId` em `localStorage` (`src/utils/utils.ts`). Para duas pessoas, chega.
- Pools de VM e o navegador virtual. Reativar isso pede Docker ou nuvem, SSH, Postgres na tabela `vbrowser` e custo por hora. Não melhora o compartilhamento de aba.
- Vimeo, magnet/WebTorrent em produção (`VITE_ENABLE_WEBTORRENT` fica desligado), Reddit e a busca paga de torrent (`STREAM_PATH`). Podem continuar como código herdado. Não entram no plano.
- Desfazer pt-BR, Mantine, PWA, coturn com segredo, rate limit, CSP, contagem regressiva e “Me surpreenda”.
- Tratar o F5 de quem **transmite** como bug. `getDisplayMedia` morre com o documento. O comportamento certo, já descrito no PR #65, é encerrar a transmissão e deixar a sala livre para começar de novo.

## Referências lidas

| Projeto | O que foi olhado | O que aproveitar | O que ignorar |
| --- | --- | --- | --- |
| [howardchung/watchparty](https://github.com/howardchung/watchparty) (clone raso, commit `cca55ce`) | `server/room.ts`, `src/components/App/App.tsx`, `Controls.tsx`, `clientTranscode.ts`, `VBrowser/` | Modelo de sala, `signalSS`, fila, chat. O WebCine já tem. | 720p, `multiopus`, Firebase, Stripe, Discord, VM, vídeo-chamada. Sem testes. |
| [screego/server](https://github.com/screego/server) `ui/src/useRoom.ts` | `getDisplayMedia` com AGC/eco/ruído desligados; [issue 221](https://github.com/screego/server/issues/221) | Confirma o pedido de áudio “cru” que o WebCine já faz. | Não define bitrate; o Chrome cai para ~300 kbps. |
| [livekit/client-sdk-js](https://github.com/livekit/client-sdk-js) `src/room/track/options.ts` | `AudioPresets.musicHighQualityStereo` (128 kbps), `ScreenSharePresets.h1080fps30` (5 Mbps), `degradationPreference` `maintain-resolution` na tela, `systemAudio` | Números de áudio e a flag do seletor. | Simulcast, presets de 5/15 fps, SFU. |
| [jitsi/lib-jitsi-meet](https://github.com/jitsi/lib-jitsi-meet) | PR [#1229](https://github.com/jitsi/lib-jitsi-meet/pull/1229) (`maintain-resolution` na área de trabalho), `ScreenObtainer` (estéreo sem AEC) e `_mungeOpus` (`stereo` + `opusMaxAverageBitrate` sem renomear o codec) | A forma segura de mexer no fmtp. | `contentHint: "detail"` como padrão de desktop; simulcast de câmera; bridge de vídeo. |

## Como provar, quando algum item sair do papel

Este PR não muda runtime. Nada de `npm test` se aplica a ele.

Quando o item 2 ou o item 5 for implementado:

- `npm run test:unit` nos helpers novos (string SDP, decisão de resync de vídeo).
- `npm run test:e2e` com `tests/e2e/screenshare-recovery.spec.ts`. O spec usa `getDisplayMedia` falso e não mede bitrate real nem Opus.
- Manual, dois Chromes desktop na mesma sala: transmitir uma **aba** com “Compartilhar áudio da guia”, volume alto o bastante para ouvir música. Quem assiste dá F5 três vezes, com “Ativar som” depois de cada carga. A imagem permanece nítida dos dois lados. O som volta sem quem transmite reiniciar.
- No `chrome://webrtc-internals`, a linha de áudio de saída fica em estéreo e o bitrate de áudio perto do teto configurado, e o vídeo perto de 1920×1080 enquanto a rede aguenta.
- Um celular na rede móvel, no meio de uma sessão com mais de uma hora, ainda recebe imagem e som depois de um F5 (caminho de relay).
