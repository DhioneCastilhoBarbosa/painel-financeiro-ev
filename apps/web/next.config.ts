import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(isProd ? { output: "standalone" } : {}),

  // Proxy /api/* → API (mesma origem no browser, sem CORS).
  // Produção Docker: INTERNAL_API_URL=http://api:8000 (rede interna).
  async rewrites() {
    const serverApiUrl =
      process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${serverApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
