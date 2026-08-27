import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Portadas de YouTube (D5). Se usan a partir de F007 (seed con portadas reales).
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
};

export default nextConfig;
