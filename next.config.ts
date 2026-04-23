import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@resvg/resvg-js', 'satori'],
};

export default nextConfig;
