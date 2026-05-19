import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
  registerType: "autoUpdate",

  workbox: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },

  includeAssets: ["favicon.ico", "apple-touch-icon.png"],

  manifest: {
    name: "Sistema Clínica",
    short_name: "Clínica",
    description: "Sistema de gestión clínica",
    theme_color: "#6d5a7b",
    background_color: "#ffffff",
    display: "standalone",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
}),
  ],
});