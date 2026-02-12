import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // Desactivar optimización de imágenes para Netlify
  },
  /* config options here */
};

export default nextConfig;
