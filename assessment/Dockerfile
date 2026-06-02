FROM node:20.19-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci

FROM node:20.19-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20.19-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV APP_STORAGE_DIR=/workspace/storage

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist

RUN mkdir -p /workspace/storage
EXPOSE 3001

CMD ["npm", "start"]
