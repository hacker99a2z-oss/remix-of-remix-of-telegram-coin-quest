import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tanstackRouter({ autoCodeSplitting: true }), react(), tailwindcss(), tsconfigPaths()],
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      strictPort: true,
      ...(env["API_PROXY_TARGET"]
        ? { proxy: { "/api": { target: env["API_PROXY_TARGET"], changeOrigin: true } } }
        : {}),
    },
  };
});
