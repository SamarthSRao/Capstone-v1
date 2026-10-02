# Static build served by nginx. The Vite dev server is not used in the cluster:
# it does not proxy the orchestrator, and VITE_* values are compiled into the
# bundle, so a cluster-internal URL would be fetched by the browser and fail.
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Relative URL. The AKS page is served from the nginx-lb host (port 80),
# and that host's dashboard nginx proxies this prefix to the orchestrator.
# Do not set a separate dashboard IP or a cluster DNS name here.
ENV VITE_ORCHESTRATOR_URL=/api/orchestrator
# Leave the simulator unset. AKS does not run one; an empty value stops the
# UI from calling window.location:8083.
ENV VITE_SIMULATOR_URL=
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
