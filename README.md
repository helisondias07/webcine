# WebCineTV

![screenshot](public/screenshot4.png)

Uma plataforma para assistir videos em sincronia com amigos.

## Description

- Synchronizes the video being watched with the current room
- Plays, pauses, and seeks are synced to all watchers
- Supports:
  - Screen sharing (full screen, browser tab or application)
  - Launch a shared virtual browser in the cloud (similar to rabb.it)
  - Stream-your-own-file
  - Video files on the Internet (anything accessible via HTTP)
  - YouTube videos
  - Magnet links (via WebTorrent)
  - .m3u8 streams (HLS)
- Create separate rooms for users on demand
- Text chat
- Video chat

## Quick Start (Desenvolvimento)

1. Entre na pasta do projeto e instale dependencias:
   - `cd projeto-watch`
   - `npm install`
2. Copie `.env.example` para `.env` e preencha as chaves.
3. Rode backend + frontend em um unico terminal:
   - `npm run dev:all`
   - (abre automaticamente `http://localhost:5173` no navegador)

Opcional (sem abrir navegador automaticamente):

- `npm run dev:all:no-open`

Observacao: o backend em desenvolvimento observa apenas `server/`, evitando reinicios indesejados quando o Vite atualiza arquivos do frontend.

Servidor padrao: `http://localhost:8080`  
Frontend padrao: `http://localhost:5173`

## Seguranca de Origem (CORS)

Para ambientes de producao, configure os domínios oficiais do frontend no backend:

- `.env`:
  - `CORS_ALLOWED_ORIGINS=https://webcinetv.com.br,https://www.webcinetv.com.br`

Regras atuais:

- Origem autorizada recebe `Access-Control-Allow-Origin`.
- Origem nao autorizada nao recebe `Access-Control-Allow-Origin`.
- Sem header `Origin` (server-to-server/same-origin) segue permitido.

Validacao automatica:

- `npm run test:cors`

Para adicionar um novo dominio oficial:

1. Adicione o dominio em `CORS_ALLOWED_ORIGINS` (separado por virgula, sem barra final).
2. Rode `npm run test:cors`.
3. Valide manualmente no navegador que a origem nova funciona e uma origem externa continua bloqueada.

## Setup Avancado (Opcional)

All of these are optional and the application should work without them. Some functionality may be missing.

### YouTube API (busca)

This project uses the YouTube API for video search, which requires an API key. You can get one from Google [here](https://console.developers.google.com).

Without an API key you won't be able to search for videos via the searchbox.

After creating a **YouTube Data API V3** access, you can create an API key which you can add to your environment variables by copying the `.env.example`, renaming it to `.env` and adding the key to the YOUTUBE_API_KEY variable.

After that restart your server to enable the YouTube API access on your server.

### Virtual Browser Setup

This project supports creating virtual browsers (using m1k1o/neko) either on a cloud provider or with Docker containers. For development, Docker is easiest.

- Install Docker: `curl -fsSL https://get.docker.com | sh`
- Make sure you have an SSH key pair set up on the server (`id_rsa` in `~/.ssh` directory), if not, use `ssh-keygen`.
- Configure `DOCKER_VM_HOST_SSH_USER` if `root` is not the correct user
- Note: If your web client is not running on the same physical machine as the server, you will also need to configure `DOCKER_VM_HOST` to a publically-resolvable value (i.e. not localhost)
- If you want to run managed instance pools (whether on cloud or with Docker), configure `VM_MANAGER_CONFIG` and run the vmWorker service.

### MediaSoup / SFU

Para salas maiores, configure `MEDIASOUP_SERVER` com a URL pública do relay
compatível com o protocolo MediaSoup usado pelo cliente. Quando configurado, o
compartilhamento envia uma única cópia ao relay, reduzindo o upload de quem
transmite. Sem essa variável, o site continua usando P2P.

Links de plataformas com DRM (Netflix, Prime, etc.) podem ser roteados para o
VBrowser quando essa infraestrutura estiver configurada.

### Transmissão estável em produção

O frontend pode ficar na Vercel, mas o servidor Socket.IO, coturn e o SFU
precisam rodar em serviços persistentes com IP/DNS público. Vercel não deve ser
o host do Socket.IO ou da mídia em tempo real.

1. Execute coturn com `--use-auth-secret` e um `--static-auth-secret` forte.
2. Defina `TURN_URLS`, `TURN_SHARED_SECRET` e `TURN_TTL_SECONDS` no backend.
   O endpoint `/webrtc/ice` entrega credenciais temporárias ao navegador.
3. Libere UDP 3478 e a faixa UDP de relay configurada no coturn; ofereça também
   TURN/TLS 5349 para redes corporativas.
4. Para mais de dois espectadores, configure `MEDIASOUP_SERVER` apontando para
   um SFU compatível. Sem ele, o transmissor envia uma cópia P2P por pessoa.

No player, a etiqueta de diagnóstico mostra resolução, FPS, bitrate e se a
conexão usa P2P ou relay. O botão de recuperar som força uma nova tentativa de
reprodução a partir de um gesto do espectador, necessária em tablets/iOS.

### Room Persistence

- Configure Postgres by adding DATABASE_URL to your .env file and then setting up the database schema
- This allows rooms to persist between server restarts

## Testes automatizados

- CORS: `npm run test:cors`
- E2E (Playwright): `npm run test:e2e`

Cenarios E2E cobertos:

- Criar sala e entrar.
- Abrir e fechar chat.
- Operar playlist.
- Mobile (320px e 390px): validacao de topbar e modal sem sobreposicao critica.

No CI (`pull_request` para `main`), os testes E2E rodam automaticamente.

## Dependencias e mitigacoes

- `pm2` possui advisory sem fix upstream no momento.
  - Mitigacao operacional recomendada: expor apenas via reverse proxy, restringir porta de admin/process manager e monitorar logs/processos.
- `webtorrent` continua com advisories transitivos sem versao segura oficial no ecossistema atual do pacote.
  - Mitigacao aplicada: feature isolada por flag `VITE_ENABLE_WEBTORRENT` (recomendado `false` em producao).

## Tech

- React
- TypeScript
- Node.js
- Redis
- PostgreSQL
- Docker

## Dicas de deploy (evitar erro fora do localhost)

- Nao use `VITE_SERVER_HOST=http://localhost:8080` em build de producao.
- Se frontend e backend estao no mesmo dominio, deixe `VITE_SERVER_HOST` vazio.
- Se estao em dominios diferentes, configure `VITE_SERVER_HOST` com a URL publica da API (ex.: `https://api.seudominio.com`).
