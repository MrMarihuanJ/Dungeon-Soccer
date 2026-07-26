import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles deployment natively — remove "standalone" to avoid conflicts
  typescript: {
    // Enable TS checking to catch type errors at build time
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
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
        hostname: "www.thesportsdb.com",
      },
      {
        protocol: "https",
        hostname: "thesportsdb.com",
      },
    ],
  },
};

export default nextConfig;
