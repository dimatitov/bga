/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' in Playwright runs: enables test hooks such as window.__boardDebug. */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
