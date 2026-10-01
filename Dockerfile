FROM oven/bun:1.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src/ ./src/
COPY drizzle/ ./drizzle/

# Non root user
USER bun

CMD ["bun", "run", "src/index.ts"]
