import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

const DEV_CACHE_VERSION = Date.now().toString();

const swVersionPlugin = {
  name: "sw-version-inject",
  transformIndexHtml(html: string) {
    // Her sunucu başlangıcında index.html içindeki __BUILD_TS__ yerine taze timestamp yaz
    return html.replace(/__BUILD_TS__/g, DEV_CACHE_VERSION);
  },
  closeBundle() {
    return;
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    swVersionPlugin,
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    target: ["es2017", "chrome61", "firefox60", "safari11", "edge79"],
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("socket.io-client")) return "socket";
          if (id.includes("@tanstack/react-query")) return "query";
          if (id.includes("wouter")) return "router";
          if (id.includes("@radix-ui")) return "ui";
          if (id.includes("lucide-react")) return "icons";
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

