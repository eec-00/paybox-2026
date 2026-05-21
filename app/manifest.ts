import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayBox - Eemerson SAC",
    short_name: "PayBox",
    description: "Sistema de Gestión de Gastos - Eemerson SAC",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a2332",
    theme_color: "#f5a623",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    id: "/dashboard",
    screenshots: [
      {
        src: "/screenshot-desktop.png",
        sizes: "2100x1600",
        type: "image/png",
        form_factor: "wide",
      },
      {
        src: "/screenshot-mobile.png",
        sizes: "1170x2531",
        type: "image/png",
        form_factor: "narrow",
      },
    ],
    categories: ["business", "finance", "productivity"],
    prefer_related_applications: false,
  };
}
