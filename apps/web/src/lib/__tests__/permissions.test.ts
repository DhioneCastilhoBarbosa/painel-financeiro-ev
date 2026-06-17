import { describe, expect, it } from "vitest";
import type { User } from "../types";
import {
  canAccess,
  canAnalyze,
  canManage,
  canManageLeads,
  canViewLeads,
  hasPermission,
  isIntelbrasmaster,
} from "../permissions";

const base: Omit<User, "role" | "is_master" | "organization_is_mother"> = {
  id: "1",
  email: "test@example.com",
  name: "Test",
  organization_id: "org-1",
  organization_name: "Test Org",
  email_verified: true,
  custom_role_id: null,
  custom_role_name: null,
  permissions: {} as User["permissions"],
};

function makeUser(overrides: Partial<User>): User {
  return {
    ...base,
    role: "analyst",
    is_master: false,
    organization_is_mother: false,
    ...overrides,
  };
}

describe("canAccess", () => {
  it("retorna false para usuário nulo", () => {
    expect(canAccess(null, "/dashboard")).toBe(false);
  });

  it("owner acessa qualquer rota listada", () => {
    const user = makeUser({ role: "owner" });
    expect(canAccess(user, "/dashboard/billing")).toBe(true);
    expect(canAccess(user, "/dashboard/files")).toBe(true);
  });

  it("viewer não acessa /dashboard/files", () => {
    const user = makeUser({ role: "viewer" });
    expect(canAccess(user, "/dashboard/files")).toBe(false);
  });

  it("viewer acessa /dashboard/relatorio", () => {
    const user = makeUser({ role: "viewer" });
    expect(canAccess(user, "/dashboard/relatorio")).toBe(true);
  });

  it("viewer não acessa /dashboard/billing", () => {
    const user = makeUser({ role: "viewer" });
    expect(canAccess(user, "/dashboard/billing")).toBe(false);
  });

  it("rotas não listadas são liberadas para qualquer autenticado", () => {
    const user = makeUser({ role: "viewer" });
    expect(canAccess(user, "/dashboard/alguma-rota-inexistente")).toBe(true);
  });

  it("painel admin exige is_master + organization_is_mother", () => {
    const user = makeUser({ role: "owner", is_master: true, organization_is_mother: true });
    expect(canAccess(user, "/dashboard/admin")).toBe(true);
  });

  it("painel admin bloqueado para owner sem is_master", () => {
    const user = makeUser({ role: "owner", is_master: false });
    expect(canAccess(user, "/dashboard/admin")).toBe(false);
  });
});

describe("canViewLeads", () => {
  it("owner pode ver leads", () => {
    expect(canViewLeads(makeUser({ role: "owner" }))).toBe(true);
  });

  it("analyst sem permissão não pode ver leads", () => {
    const user = makeUser({ role: "analyst", permissions: { view_leads: false } as User["permissions"] });
    expect(canViewLeads(user)).toBe(false);
  });

  it("analyst com view_leads pode ver leads", () => {
    const user = makeUser({ role: "analyst", permissions: { view_leads: true } as User["permissions"] });
    expect(canViewLeads(user)).toBe(true);
  });

  it("manage_leads implica view_leads", () => {
    const user = makeUser({ role: "analyst", permissions: { view_leads: false, manage_leads: true } as User["permissions"] });
    expect(canViewLeads(user)).toBe(true);
  });
});

describe("canManageLeads", () => {
  it("owner tem manage_leads implícito", () => {
    expect(canManageLeads(makeUser({ role: "owner" }))).toBe(true);
  });

  it("analyst sem permissão não gerencia leads", () => {
    const user = makeUser({ role: "analyst", permissions: { manage_leads: false } as User["permissions"] });
    expect(canManageLeads(user)).toBe(false);
  });
});

describe("hasPermission", () => {
  it("retorna false para null", () => {
    expect(hasPermission(null, "view_leads")).toBe(false);
  });

  it("owner sempre tem qualquer permissão", () => {
    const user = makeUser({ role: "owner", permissions: {} as User["permissions"] });
    expect(hasPermission(user, "view_leads")).toBe(true);
  });

  it("admin sempre tem qualquer permissão", () => {
    const user = makeUser({ role: "admin", permissions: {} as User["permissions"] });
    expect(hasPermission(user, "manage_leads")).toBe(true);
  });
});

describe("isIntelbrasmaster", () => {
  it("retorna true apenas com is_master + organization_is_mother", () => {
    const user = makeUser({ is_master: true, organization_is_mother: true });
    expect(isIntelbrasmaster(user)).toBe(true);
  });

  it("retorna false sem is_master", () => {
    const user = makeUser({ is_master: false, organization_is_mother: true });
    expect(isIntelbrasmaster(user)).toBe(false);
  });
});

describe("canManage / canAnalyze", () => {
  it("owner e admin podem gerenciar", () => {
    expect(canManage(makeUser({ role: "owner" }))).toBe(true);
    expect(canManage(makeUser({ role: "admin" }))).toBe(true);
  });

  it("analyst e viewer não podem gerenciar", () => {
    expect(canManage(makeUser({ role: "analyst" }))).toBe(false);
    expect(canManage(makeUser({ role: "viewer" }))).toBe(false);
  });

  it("viewer não pode analisar", () => {
    expect(canAnalyze(makeUser({ role: "viewer" }))).toBe(false);
  });

  it("analyst pode analisar", () => {
    expect(canAnalyze(makeUser({ role: "analyst" }))).toBe(true);
  });
});
