// Logomarca Intelbras — viewBox: 220.05 × 42.36 mm  →  proporção ≈ 5.19 : 1
const ASPECT = 220.05125 / 42.363865;

// Verde institucional Intelbras (extraído do SVG: fill:#029d39)
const GREEN = "#029d39";

interface LogoProps {
  /** Altura em px — a largura é calculada automaticamente pela proporção do logo */
  height?: number;
  className?: string;
}

/**
 * Logomarca Intelbras completa (wordmark SVG).
 * Arquivo em /public/intelbras-logo.svg
 */
export function Logo({ height = 28, className }: LogoProps) {
  return (
    <img
      src="/intelbras-logo.svg"
      alt="Intelbras"
      height={height}
      width={Math.round(height * ASPECT)}
      className={className}
      style={{ display: "block" }}
    />
  );
}

// intelbras-i.svg — viewBox: 8.8173 × 42.3638 mm  →  proporção ≈ 0.208 : 1  (ícone vertical)
const ICON_ASPECT = 8.8173475 / 42.363831;

/**
 * Ícone compacto para a sidebar recolhida — usa o arquivo intelbras-i.svg.
 * A altura define o tamanho; a largura é calculada pela proporção do arquivo.
 */
export function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/intelbras-i.svg"
      alt="Intelbras"
      height={size}
      width={Math.round(size * ICON_ASPECT)}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}
