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
      // Espelha o rewrite do vercel.json para a página /tarefas funcionar no dev.
      "/tarefas-api": {
        target: "https://xp-tarefas-equipe.base-coat.chatgpt.site",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tarefas-api/, "/api"),
      },
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
