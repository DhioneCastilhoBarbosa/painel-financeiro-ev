import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Modo standalone: bundle autocontido para Docker de produção.
  // Em produção o nginx roteia /api/* diretamente — Next.js não precisa de rewrites.
  ...(isProd ? { output: "standalone" } : {}),

  async rewrites() {
    if (isProd) return [];

    // INTERNAL_API_URL  → URL que o *servidor* Next.js usa para proxiar /api/*
    //   Em container dev: http://api:8000  (rede interna Docker)
    //   Em dev local:     não definido → cai no fallback abaixo
    //
    // NEXT_PUBLIC_API_URL → URL que o *browser* usa para fetch() diretos
    //   Em container dev: não definido (browser usa localhost:8000 pelo fallback)
    //   Em dev local:     não definido (mesmo fallback)
    //
    // Separar as duas variáveis evita que o browser tente acessar http://api:8000,
    // que só existe na rede interna Docker.
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
