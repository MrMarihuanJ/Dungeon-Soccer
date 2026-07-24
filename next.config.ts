import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Permite carregar fotos de jogadores de CDNs externos
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
      {
        protocol: "https",
        hostname: "media.api-sports.io",
      },
      {
        protocol: "https",
        hostname: "www.thesportsdb.com",
      },
      {
        protocol: "https",
        hostname: "thesportsdb.com",
      },
      // Transfermarkt CDN for player photos
      {
        protocol: "https",
        hostname: "img.a4p.de",
      },
      {
        protocol: "https",
        hostname: "cdn.sportdatahub.com",
      },
      // Additional API-Football image CDN
      {
        protocol: "https",
        hostname: "api-sports.io",
      },
      // General fallback for player photos from various sources
      {
        protocol: "https",
        hostname: "secure.cache.images.core.windows.net",
      },
    ],
  },
};

export default nextConfig;
