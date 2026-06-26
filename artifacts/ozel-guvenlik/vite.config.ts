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
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["wouter", "wouter/use-hash-location", "wouter/use-browser-location"],
          query: ["@tanstack/react-query"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tooltip", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-toast", "@radix-ui/react-popover", "@radix-ui/react-avatar", "@radix-ui/react-separator", "@radix-ui/react-slot", "@radix-ui/react-label", "@radix-ui/react-checkbox"],
          pdf: ["html2canvas", "jspdf"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
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

