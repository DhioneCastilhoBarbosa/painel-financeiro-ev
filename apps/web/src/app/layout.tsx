import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const BASE_URL = "https://financedash.com.br";
const TITLE    = "FinanceDash — Gestão Financeira de Eletropostos";
const DESCRIPTION =
  "Plataforma SaaS para gestão financeira de eletropostos no Brasil. " +
  "Simule gratuitamente o ROI, payback e receita de carregadores AC e DC. " +
  "Relatórios, KPIs e análise de investimento para operadores de estações de recarga de veículos elétricos.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: TITLE,
    template: "%s | FinanceDash",
  },
  description: DESCRIPTION,

  keywords: [
    // Termos primários
    "eletroposto", "estação de recarga veículo elétrico", "carregador elétrico Brasil",
    "gestão financeira eletroposto", "ROI eletroposto", "payback eletroposto",
    // Tecnologia
    "carregador AC", "carregador DC", "carregador 7kW", "carregador 22kW",
    "carregador 60kW", "carregador 120kW", "EVSE Brasil",
    // Negócios
    "simulador investimento eletroposto", "dashboard eletroposto",
    "quanto ganha eletroposto", "receita eletroposto", "investimento eletroposto",
    // Mercado
    "mobilidade elétrica Brasil", "veículo elétrico Brasil", "recarga EV Brasil",
    // Produto
    "FinanceDash", "software gestão eletroposto", "SaaS eletroposto",
  ],

  authors: [{ name: "FinanceDash", url: BASE_URL }],
  creator: "FinanceDash",
  publisher: "FinanceDash",

  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: BASE_URL,
    siteName: "FinanceDash",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "FinanceDash — Gestão Financeira de Eletropostos",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${BASE_URL}/og-image.png`],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  alternates: {
    canonical: BASE_URL,
  },

  // Usado por crawlers de LLMs (OpenAI, Anthropic, Perplexity, etc.)
  other: {
    "revisit-after": "7 days",
    language: "pt-BR",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geist.variable} font-sans antialiased h-full`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
