# Stage 1: Build the frontend and server typecheck
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runner
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build
COPY public ./public
COPY server ./server
COPY global.d.ts ./global.d.ts
COPY words ./words

USER node
EXPOSE 8080
CMD ["npm", "start"]
