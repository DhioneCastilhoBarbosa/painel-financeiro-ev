"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Building2, Users, FileSpreadsheet, Activity,
  CheckCircle2, XCircle, AlertTriangle, Search,
  ChevronDown, ChevronUp, ShieldAlert, Crown,
  Link2, Trash2, Copy, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { isIntelbrasmaster } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import useSWR, { mutate } from "swr";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalStats {
  organizations: { total: number; active: number };
  users: { total: number };
  files: { total: number };
  sessions: { total: number };
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  is_mother: boolean;
  created_at: string;
  trial_ends_at: string | null;
  users: number;
  files: number;
  subscription_status: string | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_master: boolean;
  is_active: boolean;
  organization_id: string;
  organization_name: string;
  organization_is_mother: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface InviteCode {
  id: string;
  code: string;
  validity_days: number;
  created_at: string;
  expires_at: string;
  expired: boolean;
  used: boolean;
  used_at: string | null;
  used_by_organization: string | null;
  used_by_user_name: string | null;
  used_by_user_email: string | null;
  creator_email: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active:    { label: "Ativo",      variant: "default" },
  suspended: { label: "Suspenso",   variant: "secondary" },
  blocked:   { label: "Bloqueado",  variant: "destructive" },
  trialing:  { label: "Trial",      variant: "outline" },
  past_due:  { label: "Em atraso",  variant: "destructive" },
  canceled:  { label: "Cancelado",  variant: "destructive" },
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Trial", starter: "Starter", pro: "Pro", enterprise: "Enterprise", free: "Free",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"orgs" | "users" | "invites">("orgs");
  const [orgSearch, setOrgSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [inviteValidity, setInviteValidity] = useState(7);
  const [creatingCode, setCreatingCode] = useState(false);

  // Guard
  if (!isIntelbrasmaster(user)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">Acesso restrito</p>
        <p className="text-sm text-muted-foreground text-center">
          Este painel é exclusivo para usuários Mestres da organização Intelbras.
        </p>
      </div>
    );
  }

  // ─── Data fetching ───────────────────────────────────────────────────────

  const { data: stats } = useSWR<GlobalStats>("/admin/stats", fetcher);
  const { data: orgs, isLoading: orgsLoading } = useSWR<OrgRow[]>(
    `/admin/organizations?search=${encodeURIComponent(orgSearch)}`,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: users, isLoading: usersLoading } = useSWR<UserRow[]>(
    `/admin/users?search=${encodeURIComponent(userSearch)}`,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: inviteCodes, isLoading: codesLoading } = useSWR<InviteCode[]>(
    "/admin/invite-codes", fetcher
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function createInviteCode() {
    setCreatingCode(true);
    try {
      await api.post("/admin/invite-codes", { validity_days: inviteValidity });
      toast.success("Código de convite gerado");
      mutate("/admin/invite-codes");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao gerar código");
    } finally {
      setCreatingCode(false);
    }
  }

  async function deleteInviteCode(codeId: string) {
    if (!confirm("Revogar este código? Ele não poderá mais ser usado.")) return;
    try {
      await api.delete(`/admin/invite-codes/${codeId}`);
      toast.success("Código revogado");
      mutate("/admin/invite-codes");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao revogar código");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  }

  async function updateOrgStatus(orgId: string, newStatus: string) {
    setLoadingAction(`status-${orgId}`);
    try {
      await api.patch(`/admin/organizations/${orgId}/status`, { status: newStatus });
      toast.success("Status atualizado");
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/admin/organizations"));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar status");
    } finally {
      setLoadingAction(null);
    }
  }

  async function updateOrgPlan(orgId: string, newPlan: string) {
    setLoadingAction(`plan-${orgId}`);
    try {
      await api.patch(`/admin/organizations/${orgId}/plan`, { plan: newPlan });
      toast.success("Plano atualizado");
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/admin/organizations"));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar plano");
    } finally {
      setLoadingAction(null);
    }
  }

  async function deleteOrg(orgId: string, orgName: string) {
    if (!confirm(`Excluir permanentemente a organização "${orgName}"?\n\nTodos os dados serão removidos. Esta ação é irreversível.`)) return;
    setLoadingAction(`delete-${orgId}`);
    try {
      await api.delete(`/admin/organizations/${orgId}`);
      toast.success(`Organização "${orgName}" excluída`);
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/admin/organizations"));
      mutate("/admin/stats");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao excluir organização");
    } finally {
      setLoadingAction(null);
    }
  }

  async function toggleUserStatus(userId: string, currentIsActive: boolean, userEmail: string) {
    const action = currentIsActive ? "bloquear" : "ativar";
    if (!confirm(`Deseja ${action} o usuário ${userEmail}?`)) return;
    setLoadingAction(`user-status-${userId}`);
    try {
      await api.patch(`/admin/users/${userId}/status`, { is_active: !currentIsActive });
      toast.success(`Usuário ${currentIsActive ? "bloqueado" : "ativado"}: ${userEmail}`);
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/admin/users"));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar status do usuário");
    } finally {
      setLoadingAction(null);
    }
  }

  async function toggleMaster(userId: string, currentIsMaster: boolean, userEmail: string) {
    const newValue = !currentIsMaster;
    if (!confirm(`${newValue ? "Conceder" : "Revogar"} cargo de Mestre para ${userEmail}?`)) return;
    setLoadingAction(`master-${userId}`);
    try {
      await api.patch(`/admin/users/${userId}/master`, { is_master: newValue });
      toast.success(`Cargo de Mestre ${newValue ? "concedido" : "revogado"}`);
      mutate((key: string) => typeof key === "string" && key.startsWith("/admin/users"));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar cargo");
    } finally {
      setLoadingAction(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Painel de Administrador</h1>
          <p className="text-sm text-muted-foreground">
            Gestão global da plataforma — exclusivo para Administradores Intelbras
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Organizações", value: stats?.organizations.total, icon: Building2, sub: `${stats?.organizations.active ?? "—"} ativas` },
          { label: "Usuários", value: stats?.users.total, icon: Users, sub: "ativos" },
          { label: "Arquivos", value: stats?.files.total, icon: FileSpreadsheet, sub: "enviados" },
          { label: "Sessões", value: stats?.sessions.total, icon: Activity, sub: "registros" },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label}>
            <CardContent className="pt-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-bold">{value?.toLocaleString("pt-BR") ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{label} · {sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["orgs", "users", "invites"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "orgs" ? "Organizações" : t === "users" ? "Usuários" : "Convites"}
          </button>
        ))}
      </div>

      {/* ── Organizações ── */}
      {tab === "orgs" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar organização..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
            />
          </div>

          {orgsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {orgs?.map((org) => (
                <Card key={org.id} className={org.is_mother ? "border-amber-500/40" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{org.name}</span>
                          {org.is_mother && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 shrink-0">
                              <Crown className="h-3 w-3 mr-1" /> Mãe
                            </Badge>
                          )}
                          <Badge variant={STATUS_BADGE[org.status]?.variant ?? "outline"}>
                            {STATUS_BADGE[org.status]?.label ?? org.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {PLAN_LABEL[org.plan] ?? org.plan}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {org.users} usuários · {org.files} arquivos · criada em {formatDate(org.created_at)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={org.plan}
                          onValueChange={(v) => { if (v) updateOrgPlan(org.id, v); }}
                          disabled={loadingAction === `plan-${org.id}`}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["trial", "starter", "pro", "enterprise", "free"].map((p) => (
                              <SelectItem key={p} value={p} className="text-xs">
                                {PLAN_LABEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {!org.is_mother && (
                          <>
                            {org.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() => updateOrgStatus(org.id, "blocked")}
                                disabled={loadingAction === `status-${org.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Bloquear
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => updateOrgStatus(org.id, "active")}
                                disabled={loadingAction === `status-${org.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ativar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => deleteOrg(org.id, org.name)}
                              disabled={loadingAction === `delete-${org.id}`}
                              title="Excluir organização permanentemente"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Expand */}
                      <button
                        className="p-1 hover:bg-muted rounded"
                        onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                      >
                        {expandedOrg === org.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Expanded details */}
                    {expandedOrg === org.id && (
                      <OrgDetail orgId={org.id} />
                    )}
                  </CardContent>
                </Card>
              ))}
              {orgs?.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhuma organização encontrada.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Usuários ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou e-mail..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          {usersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Nome", "E-mail", "Organização", "Cargo", "Status", "Último login", "Ações"].map((h) => (
                      <th key={h} className={`px-4 py-2 text-left font-medium text-muted-foreground text-xs ${h === "Ações" ? "min-w-[200px]" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users?.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        <div className="flex items-center gap-1.5">
                          {u.name}
                          {u.is_master && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Mestre" />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1">
                          {u.organization_name}
                          {u.organization_is_mother && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 px-1 py-0">Mãe</Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-xs">{u.role}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {u.is_active ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive text-xs">
                            <XCircle className="h-3.5 w-3.5" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {u.last_login_at ? formatDate(u.last_login_at) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-7 text-xs ${u.is_active ? "text-destructive hover:bg-destructive/10" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"}`}
                            disabled={loadingAction === `user-status-${u.id}`}
                            onClick={() => toggleUserStatus(u.id, u.is_active, u.email)}
                            title={u.is_active ? "Bloquear usuário" : "Ativar usuário"}
                          >
                            {u.is_active ? <XCircle className="h-3.5 w-3.5 mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                            {u.is_active ? "Bloquear" : "Ativar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-7 text-xs ${u.is_master ? "text-destructive" : "text-amber-600"}`}
                            disabled={loadingAction === `master-${u.id}`}
                            onClick={() => toggleMaster(u.id, u.is_master, u.email)}
                          >
                            <Crown className="h-3.5 w-3.5 mr-1" />
                            {u.is_master ? "Revogar Mestre" : "Mestre"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Convites ── */}
      {tab === "invites" && (
        <TooltipProvider>
          <div className="space-y-4">
            {/* Gerador */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-base">Gerar Código de Convite</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  O código permite criar uma nova organização no sistema e dá acesso ao Trial gratuito.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Validade (dias)</label>
                    <Select
                      value={String(inviteValidity)}
                      onValueChange={(v) => setInviteValidity(Number(v))}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 3, 7, 14, 30, 60, 90].map((d) => (
                          <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia" : "dias"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createInviteCode} disabled={creatingCode} className="gap-1.5">
                    {creatingCode
                      ? <><span className="h-3.5 w-3.5 border-2 border-t-transparent rounded-full animate-spin" />Gerando…</>
                      : <><Link2 className="h-3.5 w-3.5" />Gerar código</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Lista de códigos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Códigos gerados</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {codesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : !inviteCodes?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum código gerado ainda.
                  </p>
                ) : (
                  <div className="divide-y">
                    {inviteCodes.map((c) => {
                      const statusLabel = c.used
                        ? "Usado"
                        : c.expired
                        ? "Expirado"
                        : "Disponível";
                      const statusColor = c.used
                        ? "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800"
                        : c.expired
                        ? "text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700"
                        : "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800";

                      return (
                        <div key={c.id} className="flex items-start gap-4 px-4 py-3">
                          {/* Código */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-sm font-mono font-bold tracking-widest text-foreground">
                                {c.code}
                              </code>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                                {statusLabel}
                              </span>
                              {!c.used && !c.expired && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <button
                                        onClick={() => copyCode(c.code)}
                                        className="p-1 rounded hover:bg-muted transition-colors"
                                      />
                                    }
                                  >
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>Copiar código</TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {c.used
                                    ? `Usado em ${formatDate(c.used_at!)}`
                                    : c.expired
                                    ? `Expirou em ${formatDate(c.expires_at)}`
                                    : `Expira em ${formatDate(c.expires_at)}`}
                                  {" · "}{c.validity_days} dias
                                </span>
                              </div>
                              {c.used && c.used_by_organization && (
                                <p>
                                  <span className="font-medium">Organização:</span> {c.used_by_organization}
                                  {c.used_by_user_name && (
                                    <> · <span className="font-medium">Usuário:</span> {c.used_by_user_name} ({c.used_by_user_email})</>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Revogar */}
                          {!c.used && !c.expired && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    onClick={() => deleteInviteCode(c.id)}
                                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 transition-colors shrink-0 mt-0.5"
                                  />
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </TooltipTrigger>
                              <TooltipContent>Revogar código</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Org Detail (expandido) ───────────────────────────────────────────────────

function OrgDetail({ orgId }: { orgId: string }) {
  const { data, isLoading } = useSWR(`/admin/organizations/${orgId}`, fetcher);

  if (isLoading) return <div className="mt-3"><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Membros</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data?.users?.map((u: UserRow) => (
          <div key={u.id} className="flex items-center gap-2 text-sm">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
              {u.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-xs">{u.name}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email} · {u.role}</p>
            </div>
            {u.is_master && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
          </div>
        ))}
      </div>

      {data?.recent_files?.length > 0 && (
        <>
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arquivos recentes</p>
          <div className="space-y-1">
            {data.recent_files.map((f: { id: string; original_filename: string; status: string; file_size_bytes: number; created_at: string }) => (
              <div key={f.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground max-w-xs">{f.original_filename}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{f.status}</Badge>
                  <span className="text-muted-foreground">{formatDate(f.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
