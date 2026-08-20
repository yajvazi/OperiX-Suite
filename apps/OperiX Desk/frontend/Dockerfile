FROM node:22-alpine AS build

WORKDIR /app

# Build from the monorepo root so the Desk web client uses the shared
# OperiX i18n package instead of trying to resolve a private workspace
# package from the public npm registry.
COPY package*.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm ci --workspace=frontend --include-workspace-root=false

WORKDIR /app/apps/OperiX Desk/frontend
ARG VITE_API_URL=/api
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
RUN npm run build

FROM nginx:alpine

COPY --from=build ["/app/apps/OperiX Desk/frontend/dist", "/usr/share/nginx/html"]
COPY ["apps/OperiX Desk/frontend/nginx.conf", "/etc/nginx/conf.d/default.conf"]

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
