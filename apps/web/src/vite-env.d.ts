/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base del servidor de OCR. Vacío = mismo origen. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?url' {
  const url: string;
  export default url;
}
