import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@resvg/resvg-js', 'satori', 'pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
