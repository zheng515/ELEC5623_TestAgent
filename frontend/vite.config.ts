import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api": {
      target: env.BACKEND_URL || "http://127.0.0.1:8000",
      changeOrigin: true,
    },
  };
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      proxy,
      ...(process.env.CODEX_SANDBOX === "seatbelt"
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    preview: { host: "127.0.0.1", port: 3000, strictPort: true, proxy },
  };
});
