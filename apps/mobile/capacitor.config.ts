import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Reverse-DNS id; also the Android applicationId, which cannot change once published.
  appId: "io.github.kumori1313.amcn",
  appName: "Care Navigator",
  // Built by `pnpm --filter @amcn/web build:mobile` (see package scripts).
  webDir: "../web/dist-mobile",
  server: {
    // Served from https://localhost, which the API's default CORS list allows.
    androidScheme: "https",
    // Plain-HTTP API access (e.g. an emulator reaching http://10.0.2.2:8000) is for development only.
    cleartext: process.env.CAP_CLEARTEXT === "1",
  },
};

export default config;
