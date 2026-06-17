import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUTS,
  calcCapex,
  calcFixedOpex,
  computeProject,
  pmt,
} from "../investimentoCalc";

describe("pmt", () => {
  it("divide igualmente sem juros", () => {
    expect(pmt(1200, 0, 12)).toBeCloseTo(100, 5);
  });

  it("retorna 0 para n=0", () => {
    expect(pmt(1000, 0, 0)).toBe(0);
  });

  it("retorna 0 para principal zero", () => {
    expect(pmt(0, 0, 12)).toBe(0);
  });

  it("calcula parcela com juros (PMT padrão)", () => {
    // PV=1000, taxa=1%/mês, n=12 parcelas → PMT ≈ 88.85
    expect(pmt(1000, 0.01, 12)).toBeCloseTo(88.85, 1);
  });
});

describe("calcCapex", () => {
  it("modo total retorna capex_override", () => {
    const inputs = { ...DEFAULT_INPUTS, capex_mode: "total" as const, capex_override: 50000 };
    expect(calcCapex(inputs)).toBe(50000);
  });

  it("modo detalhado soma os componentes", () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      capex_mode: "detailed" as const,
      charger_value: 10000,
      electrical_infra: 2000,
      civil_work: 1000,
      transformer: 500,
      electrical_protection: 300,
      homologation: 200,
      software_backend: 0,
      installation: 1000,
      other_capex: 0,
    };
    expect(calcCapex(inputs)).toBe(15000);
  });

  it("modo total com capex_override=0 cai para modo detalhado", () => {
    const inputs = { ...DEFAULT_INPUTS, capex_mode: "total" as const, capex_override: 0 };
    // override is 0 (falsy), so it falls through to sum of components
    const manual = DEFAULT_INPUTS.charger_value + DEFAULT_INPUTS.electrical_infra +
      DEFAULT_INPUTS.civil_work + DEFAULT_INPUTS.transformer +
      DEFAULT_INPUTS.electrical_protection + DEFAULT_INPUTS.homologation +
      DEFAULT_INPUTS.software_backend + DEFAULT_INPUTS.installation + DEFAULT_INPUTS.other_capex;
    expect(calcCapex(inputs)).toBe(manual);
  });
});

describe("calcFixedOpex", () => {
  it("modo total retorna opex_fixed_override", () => {
    const inputs = { ...DEFAULT_INPUTS, opex_mode: "total" as const, opex_fixed_override: 500 };
    expect(calcFixedOpex(inputs)).toBe(500);
  });

  it("modo detalhado soma os itens fixos", () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      opex_mode: "detailed" as const,
      internet_monthly: 100,
      backend_monthly: 50,
      preventive_maintenance: 80,
      corrective_maintenance: 20,
      rent: 200,
      insurance: 0,
      admin_costs: 50,
      other_opex: 0,
    };
    expect(calcFixedOpex(inputs)).toBe(500);
  });
});

describe("computeProject", () => {
  it("roda sem erros com os inputs padrão", () => {
    expect(() => computeProject(DEFAULT_INPUTS)).not.toThrow();
  });

  it("retorna capex_total coerente com calcCapex", () => {
    const result = computeProject(DEFAULT_INPUTS);
    expect(result.capex_total).toBe(calcCapex(DEFAULT_INPUTS));
  });

  it("retorna monthly_data com horizon_years*12 pontos", () => {
    const result = computeProject(DEFAULT_INPUTS);
    expect(result.monthly_data).toHaveLength(DEFAULT_INPUTS.horizon_years * 12);
  });

  it("NPV é um número finito", () => {
    const result = computeProject(DEFAULT_INPUTS);
    expect(Number.isFinite(result.npv)).toBe(true);
  });

  it("cenários de ocupação têm 4 entradas (10%, 20%, 40%, 60%)", () => {
    const result = computeProject(DEFAULT_INPUTS);
    expect(result.occ_scenarios).toHaveLength(4);
    expect(result.occ_scenarios.map((s) => s.occupancy_pct)).toEqual([10, 20, 40, 60]);
  });

  it("IRR é null ou número finito (nunca NaN ou Infinity)", () => {
    const result = computeProject(DEFAULT_INPUTS);
    if (result.irr !== null) {
      expect(Number.isFinite(result.irr)).toBe(true);
    }
  });
});
