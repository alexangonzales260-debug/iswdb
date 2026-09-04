import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Portadas de YouTube (D5). Se usan a partir de F007 (seed con portadas reales).
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  // F017: dominio canónico es http://localhost:3000 (site_url, NEXT_PUBLIC_SITE_URL
  // y browser client coinciden). Al unificar browser + redirectTo + site_url en
  // localhost, las cookies de sesión/code_verifier del OAuth quedan en localhost y
  // el callback las recibe; solo se permite ese origin en dev.
  allowedDevOrigins: ["http://localhost:3000"],
};

export default nextConfig;
