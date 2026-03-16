FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY build ./build
COPY public ./public
COPY server ./server
COPY global.d.ts ./global.d.ts
COPY words ./words

USER node
EXPOSE 8080
CMD ["npm", "start"]
