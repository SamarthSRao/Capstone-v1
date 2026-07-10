/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SIMULATOR_URL: string
  readonly VITE_TELEMETRY_MODE?: string
  readonly VITE_CLOUD_METRICS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
