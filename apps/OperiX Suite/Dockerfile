FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY ["apps/OperiX Suite/package.json", "./suite/package.json"]
RUN cd suite && npm install --include=dev

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SITE_URL=https://operixsuite.com
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/suite/node_modules ./suite/node_modules
COPY ["apps/OperiX Suite/", "./suite/"]
RUN cd suite && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs ["/app/suite/.next/standalone/.", "/app/"]
COPY --from=builder --chown=nextjs:nodejs ["/app/suite/.next/static", "/app/.next/static"]
COPY --from=builder --chown=nextjs:nodejs ["/app/suite/public", "/app/public"]
USER nextjs
EXPOSE 3000
CMD ["node", "/app/server.js"]
