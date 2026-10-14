# WebCineTV

Assista vídeos em sincronia com amigos, de graça. Não precisa de conta e não precisa pagar: acesse o site, crie uma sala, envie o convite e escolha o que assistir.

## O que a sala faz

- Sincroniza play, pause e seek entre quem está na sala
- Cria uma sala separada para cada sessão, acessível por link
- Chat de texto ao lado do vídeo
- Fila de reprodução
- Sala com senha e sala permanente (a permanente depende do Postgres)

Fontes de vídeo:

- YouTube
- Arquivo do próprio dispositivo
- Arquivo na internet, por link HTTP
- Streams `.m3u8` (HLS)
- Compartilhamento de tela (tela inteira, aba do navegador ou aplicativo)
- Sugestão “Me surpreenda” (YouTube e filmes), quando as chaves opcionais estão configuradas

Magnet links via WebTorrent ficam desligados por padrão. Veja a seção opcional abaixo.

## Desenvolvimento

1. Na pasta do projeto, instale as dependências: `npm install`
2. Copie `.env.example` para `.env`
3. Suba backend e frontend no mesmo terminal: `npm run dev:all`

O comando abre `http://localhost:5173`. Para subir sem abrir o navegador, use `npm run dev:all:no-open`.

Em desenvolvimento o backend observa só `server/`, então o Vite não reinicia o servidor ao atualizar o frontend.

- Frontend: `http://localhost:5173`
- Servidor: `http://localhost:8080`

A aplicação sobe sem as chaves opcionais. Sem elas, busca do YouTube, sugestão de filmes e salas permanentes ficam indisponíveis. Criar sala, chat, YouTube por link, arquivo e compartilhamento de tela continuam funcionando.

## Configuração opcional

### Busca do YouTube

A busca usa a YouTube Data API v3. Sem `YOUTUBE_API_KEY`, ainda dá para colar um link do YouTube na sala. A chave é criada no [Google Cloud Console](https://console.developers.google.com). Coloque o valor em `.env` e reinicie o servidor.

### Me surpreenda

- `TMDB_READ_TOKEN` (ou `TMDB_API_KEY`) habilita sugestão de filmes
- `YOUTUBE_API_KEY` habilita sugestão de vídeos
- `WATCHMODE_API_KEY` tenta resolver um link direto do título sugerido

### Salas permanentes

Defina `DATABASE_URL` e aplique o schema em `sql/`. Com Postgres, uma sala permanente sobrevive a reinícios do servidor. Sem isso, as salas são temporárias.

### Compartilhamento em salas maiores (MediaSoup)

`MEDIASOUP_SERVER` aponta para um relay compatível com o cliente. Com ele, quem compartilha tela ou arquivo envia uma cópia só. Sem a variável, o compartilhamento segue ponto a ponto: uma cópia por espectador.

### Transmissão estável em produção

O frontend pode ficar na Vercel. Socket.IO, coturn e o SFU precisam de um serviço persistente, com IP ou DNS público. A Vercel não deve hospedar o Socket.IO nem a mídia em tempo real.

1. Rode o coturn com `--use-auth-secret` e um `--static-auth-secret` forte.
2. Defina `TURN_URLS`, `TURN_SHARED_SECRET` e `TURN_TTL_SECONDS` no backend. O endpoint `/webrtc/ice` entrega credenciais temporárias ao navegador.
3. Libere UDP 3478 e a faixa UDP de relay do coturn. TURN/TLS na 5349 ajuda em redes corporativas.
4. Para mais de dois espectadores no compartilhamento, configure `MEDIASOUP_SERVER`.

O botão de recuperar som pede uma nova tentativa de reprodução a partir de um gesto de quem assiste. Isso é necessário em tablets e no iOS.

### CORS

Em produção, liste os domínios do frontend no backend:

```
CORS_ALLOWED_ORIGINS=https://webcinetv.com.br,https://www.webcinetv.com.br
```

Origem autorizada recebe `Access-Control-Allow-Origin`. Origem de fora não recebe. Pedido sem header `Origin` (mesmo domínio ou servidor para servidor) continua permitido.

Para incluir um domínio:

1. Adicione o domínio em `CORS_ALLOWED_ORIGINS`, separado por vírgula, sem barra no final.
2. Rode `npm run test:cors`.
3. Confira no navegador que a origem nova funciona e que uma origem externa continua bloqueada.

### Proxy reverso e rate limit

O site fica atrás de Cloudflare e Render. `TRUST_PROXY_HOPS` (padrão `2`) é o número de proxies na frente do backend, para o rate limit usar o IP real do cliente. Use `0` quando o backend está exposto direto, como no desenvolvimento local. Um número maior que o real permite falsificar `X-Forwarded-For`. Um número menor faz todo mundo compartilhar o IP do proxy.

### WebTorrent

`webtorrent` ainda tem avisos de segurança transitivos, sem versão corrigida no ecossistema do pacote. A reprodução de magnet fica atrás de `VITE_ENABLE_WEBTORRENT`. O recomendado em produção é `false`.

### Onde o frontend acha a API

- Não use `VITE_SERVER_HOST=http://localhost:8080` num build de produção.
- Se frontend e backend estão no mesmo domínio, deixe `VITE_SERVER_HOST` vazio.
- Se estão em domínios diferentes, use a URL pública da API, por exemplo `https://api.seudominio.com`.

## Testes

- CORS: `npm run test:cors`
- Unitários: `npm run test:unit`
- E2E (Playwright): `npm run test:e2e`

Os E2E cobrem criar sala e entrar, abrir e fechar o chat, usar a playlist, e o layout mobile (320px e 390px) da topbar e do modal. No CI, em pull request para `main`, CORS e E2E rodam automaticamente.

## Stack

- React
- TypeScript
- Node.js
- Redis
- PostgreSQL
- Docker
