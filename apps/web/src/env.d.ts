/// <reference types="vite/client" />

/** package.json `version`, frozen into the bundle by the Vite `define` in vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Google Analytics 4 measurement id. Absent in local checkouts and in every
   * dev build; set as a Vercel project variable for the deployed game. An empty
   * or missing value disables measurement entirely.
   */
  readonly VITE_GA_ID?: string;
}
