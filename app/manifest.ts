import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayBox - Eemerson SAC",
    short_name: "PayBox",
    description: "Sistema de Gestión de Gastos - Eemerson SAC",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a2332",
    theme_color: "#f5a623",
    icons: [
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "finance", "productivity"],
  };
}
