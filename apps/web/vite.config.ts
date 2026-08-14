import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  envDir: "../..",
  plugins: [
    react(),
    legacy({
      targets: ["chrome >= 38", "safari >= 10", "ios >= 10", "samsung >= 4"],
      modernTargets: ["chrome >= 61", "safari >= 11", "ios >= 11", "samsung >= 8"],
      modernPolyfills: true,
      additionalLegacyPolyfills: ["whatwg-fetch"],
    }),
  ],
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
