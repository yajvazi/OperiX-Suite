FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY ["apps/OperiX Invoice/OperiX Web/package.json", "apps/OperiX Invoice/OperiX Web/package.json"]
COPY ["packages/accounting/package.json", "packages/accounting/package.json"]
COPY ["packages/money/package.json", "packages/money/package.json"]
COPY ["packages/payroll/package.json", "packages/payroll/package.json"]
RUN npm ci --workspace web-suite --include-workspace-root=false

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace web-suite

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/.next/standalone/.", "/app/"]
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/.next/static", "/app/.next/static"]
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/.next/static", "/app/apps/OperiX Invoice/OperiX Web/.next/static"]
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/.next/static", "/apps/OperiX Invoice/OperiX Web/.next/static"]
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/public", "/app/public"]
COPY --from=builder --chown=nextjs:nodejs ["/app/apps/OperiX Invoice/OperiX Web/public", "/app/apps/OperiX Invoice/OperiX Web/public"]
USER nextjs
EXPOSE 3000
CMD ["node", "/app/apps/OperiX Invoice/OperiX Web/server.js"]
