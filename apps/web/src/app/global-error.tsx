"use client";

import { useEffect } from "react";

/**
 * Error boundary de último recurso — captura erros que ocorrem no próprio
 * layout raiz (onde os boundaries de segmento não alcançam). Precisa renderizar
 * a própria árvore <html>/<body> e não depende de provedores/tema da app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] erro fatal:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#fff",
          color: "#163134",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Erro inesperado
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem" }}>
            A aplicação encontrou um problema. Tente recarregar a página.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#06CB3F",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
