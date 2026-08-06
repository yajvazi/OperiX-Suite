FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts

# NEXT_PUBLIC_* values are inlined into the browser bundle by Next.js. They
# are public values, but must be supplied during the production image build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build --workspace operix-support
RUN npm run worker:build --workspace operix-support

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# The standalone server is copied separately so the web service remains small;
# the source workspace and runtime dependencies are retained for the dedicated
# TypeScript worker, which runs through the pinned Node 22 tsx runtime.
COPY --from=builder ["/app/apps/OperiX Support/.next/standalone/", "./"]
COPY --from=builder ["/app/apps/OperiX Support/.next/static", "/app/apps/OperiX Support/.next/static"]
COPY --from=builder ["/app/apps/OperiX Support/public", "/app/apps/OperiX Support/public"]
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder ["/app/apps/OperiX Support/src", "/app/apps/OperiX Support/src"]
COPY --from=builder ["/app/apps/OperiX Support/package.json", "/app/apps/OperiX Support/package.json"]
COPY --from=builder /app/packages ./packages

EXPOSE 3010 3011
CMD ["node", "apps/OperiX Support/server.js"]
