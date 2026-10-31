/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base URL of the API for builds that are not served next to it (Tauri, Capacitor). */
  readonly VITE_API_BASE_URL?: string;
  /** Set for Tauri/Capacitor builds: no service worker or install prompts. */
  readonly VITE_NATIVE?: string;
}
