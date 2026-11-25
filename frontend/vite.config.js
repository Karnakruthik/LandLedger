import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../node_modules", import.meta.url)),
      ],
    },
    proxy: { "/api": process.env.API_TARGET || "http://127.0.0.1:8080" },
  },
});
