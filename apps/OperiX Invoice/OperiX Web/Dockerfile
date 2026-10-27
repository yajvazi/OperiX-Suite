# Build context is the generated tree from scripts/oss/export-web.mjs (see
# scripts/oss/build-web-image.sh): this app plus the shared packages it uses, with its
# own package.json and package-lock.json. Install and build run in one stage so every
# node_modules folder npm creates is available to the build.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# .npmrc (legacy-peer-deps) is part of the context and must match how the lockfile was generated.
RUN npm ci
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
