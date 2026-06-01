import type { MetadataRoute } from "next";

const BASE_URL = "https://financedash.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register"],
        // Impede indexação do dashboard e da API
        disallow: ["/dashboard/", "/api/", "/_next/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
