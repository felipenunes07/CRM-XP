import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
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
