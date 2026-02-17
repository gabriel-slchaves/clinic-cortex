import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss(), jsxLocPlugin()];
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const usePolling = process.env.CHOKIDAR_USEPOLLING === "true";
const watchInterval = Number(process.env.CHOKIDAR_INTERVAL || 120);

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  envDir: path.resolve(rootDir),
  build: {
    outDir: path.resolve(rootDir, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    hmr: {
      clientPort: 3000,
    },
    proxy: {
      "/api/whatsapp": {
        target: process.env.WHATSAPP_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/whatsapp/, "/whatsapp"),
      },
      "/api/team": {
        target: process.env.WHATSAPP_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/team/, "/team"),
      },
    },
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".localhost",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    watch: {
      usePolling,
      interval: watchInterval,
      awaitWriteFinish: {
        stabilityThreshold: Math.max(75, watchInterval),
        pollInterval: Math.max(100, Math.floor(watchInterval / 2)),
      },
      ignored: [
        "**/.git/**",
        "**/.pnpm-store/**",
        "**/.corepack/**",
        "**/dist/**",
        "**/coverage/**",
        "**/docker/**",
        "**/supabase/**",
        "**/whatsapp-service/**",
        "**/*.log",
      ],
    },
  },
});

