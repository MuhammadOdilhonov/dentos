# ───────── 1-bosqich: build ─────────
FROM node:22-alpine AS builder
WORKDIR /app

# Backend API manzili build vaqtida yoziladi (NEXT_PUBLIC_* baked bo'ladi)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ───────── 2-bosqich: runtime (standalone, yengil) ─────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
