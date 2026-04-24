import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.FINDANADVISOR_API_PORT ?? "3000";
const CLIENT_PORT = Number(process.env.FINDANADVISOR_CLIENT_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: CLIENT_PORT,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
