# Built SPA served by nginx (spec §4.11). Build context: the repository root (the frontend imports
# docs/seed and shared/test-vectors at build time).
FROM node:24-alpine AS build
ARG VITE_HIDE_UNMIGRATED=true
ENV VITE_HIDE_UNMIGRATED=$VITE_HIDE_UNMIGRATED
WORKDIR /src
COPY docs/seed docs/seed
COPY shared shared
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend frontend
RUN cd frontend && npx vite build

FROM nginx:1.27-alpine
COPY infra/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/frontend/dist /usr/share/nginx/html
