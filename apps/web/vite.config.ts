import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The Tauri and Capacitor builds run in their own Vite modes (see .env.desktop and .env.mobile):
// the app is bundled, so there is no service worker or install prompt.
export default defineConfig(({ mode }) => {
  const native = mode === "desktop" || mode === "mobile";
  return {
    plugins: [
      react(),
      VitePWA({
        disable: native,
        // "prompt": a new version waits until the user chooses to update, so a reload never
        // wipes a document someone is in the middle of reading or editing.
        registerType: "prompt",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "Accessible Medical Care Navigator",
          short_name: "Care Navigator",
          description:
            "Understand medical forms and paperwork in plain language.",
          lang: "en",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#0b4f9c",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // App shell only (includes the lazy dyslexia font). Nothing from /api is ever cached:
          // those responses contain the user's medical text.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
        },
      }),
    ],
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
