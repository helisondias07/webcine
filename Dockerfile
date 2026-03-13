FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/global.d.ts ./global.d.ts
COPY --from=build /app/words ./words

USER node
EXPOSE 8080
CMD ["npm", "start"]
