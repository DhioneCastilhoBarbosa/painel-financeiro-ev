import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCurrency,
  formatKwh,
  formatNumber,
  formatPct,
} from "../format";

// Intl.NumberFormat pt-BR uses NBSP (U+00A0) between "R$" and the number.
// Normalize to a regular space so assertions don't depend on invisible chars.
function norm(s: string) {
  return s.replace(/ /g, " ");
}

describe("formatCurrency", () => {
  it("formata valor positivo em BRL", () => {
    expect(norm(formatCurrency(1000))).toBe("R$ 1.000,00");
  });

  it("retorna R$ 0,00 para null", () => {
    expect(norm(formatCurrency(null))).toBe("R$ 0,00");
  });

  it("retorna R$ 0,00 para undefined", () => {
    expect(norm(formatCurrency(undefined))).toBe("R$ 0,00");
  });

  it("retorna R$ 0,00 para NaN", () => {
    expect(norm(formatCurrency(NaN))).toBe("R$ 0,00");
  });

  it("formata valores com centavos", () => {
    expect(norm(formatCurrency(1.5))).toBe("R$ 1,50");
  });
});

describe("formatNumber", () => {
  it("formata sem decimais por padrao", () => {
    expect(formatNumber(1234)).toBe("1.234");
  });

  it("formata com decimais especificados", () => {
    expect(formatNumber(1234.5, 1)).toBe("1.234,5");
  });

  it("retorna '0' para null", () => {
    expect(formatNumber(null)).toBe("0");
  });
});

describe("formatPct", () => {
  it("formata porcentagem com 1 decimal", () => {
    expect(formatPct(25.5)).toBe("25.5%");
  });

  it("formata sem decimal quando decimals=0", () => {
    expect(formatPct(50, 0)).toBe("50%");
  });

  it("retorna '0%' para null", () => {
    expect(formatPct(null)).toBe("0%");
  });
});

describe("formatBytes", () => {
  it("formata bytes abaixo de 1KB", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formata KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formata MB", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("formatKwh", () => {
  it("formata com sufixo kWh", () => {
    expect(formatKwh(1500)).toBe("1.500,0 kWh");
  });
});
