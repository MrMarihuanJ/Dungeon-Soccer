import type { NextConfig } from "next";
import path from "path";

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
    ],
  },
  // Turbopack root: garante que o Next.js encontre o pacote `next` mesmo
  // quando o projeto é servido a partir de um subdiretório.
  // Isto corrige o erro "Turbopack Error: Next.js package not found".
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
