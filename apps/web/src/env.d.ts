/// <reference types="vite/client" />

/** package.json `version`, frozen into the bundle by the Vite `define` in vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Full first-party event-ingest URL. Absent in local checkouts and every dev
   * build; set only for production. Empty or missing disables measurement.
   */
  readonly VITE_ANALYTICS_ENDPOINT?: string;
}
