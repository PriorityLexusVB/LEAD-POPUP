import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Try to be friendly to remote dev/proxies (Cloud Workstations, Codespaces, etc.)
const host = true;               // bind 0.0.0.0
const port = 5173;
const strictPort = true;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host,
    port,
    strictPort,
    // HMR over WebSocket can be blocked; let Vite pick best effort.
    // If HMR still fails, it'll show overlay but page should render.
    hmr: { overlay: true },
  },
});
