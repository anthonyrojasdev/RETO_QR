/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL pública de Kong (por defecto http://localhost:8000). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
