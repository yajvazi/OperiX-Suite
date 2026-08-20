FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY ["apps/OperiX Help Center/package.json", "apps/OperiX Help Center/package.json"]
RUN npm ci --workspace=operix-help-center --include-workspace-root=false --ignore-scripts

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG INDEXING_ALLOWED=true
ARG NEXT_PUBLIC_SITE_URL=https://helpdesk.operixsuite.com
ENV INDEXING_ALLOWED=$INDEXING_ALLOWED
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps ["/app/apps/OperiX Help Center/node_modules", "./apps/OperiX Help Center/node_modules"]
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY ["apps/OperiX Help Center", "apps/OperiX Help Center"]
RUN npm run build --workspace=operix-help-center

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3015
ENV HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nextjs ["/app/apps/OperiX Help Center/.next/standalone", "./"]
COPY --from=builder --chown=nextjs:nextjs ["/app/apps/OperiX Help Center/.next/static", "./apps/OperiX Help Center/.next/static"]
COPY --from=builder --chown=nextjs:nextjs ["/app/apps/OperiX Help Center/public", "./apps/OperiX Help Center/public"]
USER nextjs
EXPOSE 3015
CMD ["node", "apps/OperiX Help Center/server.js"]
