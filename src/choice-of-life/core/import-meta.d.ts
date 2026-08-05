/** Narrow Vite build flag used by core code without importing DOM/client APIs. */
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
