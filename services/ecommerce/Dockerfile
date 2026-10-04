# Static build served by nginx (the previous image ran the Vite dev server,
# which is not suitable for the cluster: no production bundle, HMR websocket,
# and VITE_* values must be baked at build time).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin: the storefront is served on nginx-lb :8090, which sends /api/*,
# /health and /metrics to the target-app pods. An empty value (not unset) keeps
# the `??` default of http://localhost:8080 from being used.
ENV VITE_API_URL=
# Live system status comes from the orchestrator status endpoint, proxied
# read-only by nginx-lb at this relative path.
ENV VITE_TELEMETRY_MODE=cloud
ENV VITE_CLOUD_METRICS_URL=/api/orchestrator/api/target/status
ENV VITE_SIMULATOR_URL=
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
