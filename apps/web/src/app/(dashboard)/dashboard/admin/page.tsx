"use client";

import { useState, Fragment } from "react";
import { toast } from "sonner";
import {
  Building2, Users, FileSpreadsheet, Activity,
  CheckCircle2, XCircle, AlertTriangle, Search,
  ChevronDown, ChevronUp, ShieldAlert, Crown,
  Link2, Trash2, Copy, Clock, Package, Pencil, Save, X,
  Lightbulb, MessageSquarePlus, CheckCheck,
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

// ─── Plan Config Types ────────────────────────────────────────────────────────

interface FeatureMeta { key: string; label: string; }

interface PlanConfig {
  id: string;
  name: string;
  price_brl: number;
  price_label: string;
  max_users: number;
  max_files: number;
  is_public: boolean;
  stripe_price_id: string | null;
  features: string[];
  feature_flags: Record<string, boolean>;
}

interface PlanConfigsResponse {
  plans: PlanConfig[];
  available_features: FeatureMeta[];
}

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
  subscription_plan: string | null;
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

const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", reviewed: "Em análise", resolved: "Resolvido",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"orgs" | "users" | "invites" | "plans" | "feedback">("orgs");
  const [editingTrialOrgId, setEditingTrialOrgId] = useState<string | null>(null);
  const [trialDaysInput, setTrialDaysInput] = useState(30);
  const [savingTrial, setSavingTrial] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [savingResponse, setSavingResponse] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [inviteValidity, setInviteValidity] = useState(7);
  const [creatingCode, setCreatingCode] = useState(false);
  const [deletingAllCodes, setDeletingAllCodes] = useState(false);

  // ─── Data fetching ───────────────────────────────────────────────────────
  // IMPORTANT: all useSWR calls must be BEFORE any conditional return so that
  // hook count never changes between renders (Rules of Hooks). When the user is
  // not an admin the key is null and SWR skips fetching automatically.

  const isAdmin = isIntelbrasmaster(user);

  const { data: stats } = useSWR<GlobalStats>(
    isAdmin ? "/admin/stats" : null, fetcher
  );
  const { data: orgs, isLoading: orgsLoading } = useSWR<OrgRow[]>(
    isAdmin ? `/admin/organizations?search=${encodeURIComponent(orgSearch)}` : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: users, isLoading: usersLoading } = useSWR<UserRow[]>(
    isAdmin ? `/admin/users?search=${encodeURIComponent(userSearch)}` : null,
    fetcher,
    { keepPreviousData: true }
  );
  const {
    data: inviteCodes,
    isLoading: codesLoading,
    error: codesError,
    mutate: reloadCodes,
  } = useSWR<InviteCode[]>(isAdmin ? "/admin/invite-codes" : null, fetcher);

  const { data: feedbackItems = [], isLoading: feedbackLoading, mutate: reloadFeedback } = useSWR<{
    id: string; type: string; title: string; content: string; status: string;
    user_name: string; user_email: string; organization_id: string; organization_name: string;
    admin_response: string | null; created_at: string;
  }[]>(isAdmin ? "/admin/feedback?limit=200" : null, fetcher);

  // ─── Guard ───────────────────────────────────────────────────────────────

  if (!isAdmin) {
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

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function createInviteCode() {
    setCreatingCode(true);
    try {
      await api.post("/admin/invite-codes", { validity_days: inviteValidity });
      toast.success("Código de convite gerado");
      await reloadCodes();
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
      await reloadCodes();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao revogar código");
    }
  }

  async function deleteAllPendingCodes() {
    const pending = inviteCodes?.filter((c) => !c.used && !c.expired) ?? [];
    if (!pending.length) return;
    if (!confirm(`Excluir ${pending.length} código(s) pendente(s)? Esta ação não pode ser desfeita.`)) return;
    setDeletingAllCodes(true);
    try {
      await api.delete("/admin/invite-codes/pending");
      toast.success("Códigos pendentes excluídos");
      await reloadCodes();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao excluir códigos");
    } finally {
      setDeletingAllCodes(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado!");
    } catch {
      toast.error("Erro ao copiar código");
    }
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

  async function updateTrialDays(orgId: string, days: number) {
    setSavingTrial(true);
    try {
      await api.patch(`/admin/organizations/${orgId}/trial`, { days_from_now: days });
      toast.success(`Trial estendido por ${days} dias`);
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/admin/organizations"));
      setEditingTrialOrgId(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar trial");
    } finally {
      setSavingTrial(false);
    }
  }

  async function updateFeedbackStatus(feedbackId: string, newStatus: string) {
    try {
      await api.patch(`/admin/feedback/${feedbackId}/status`, { status: newStatus });
      toast.success("Status atualizado");
      await reloadFeedback();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao atualizar status");
    }
  }

  async function respondFeedback(feedbackId: string) {
    if (!responseText.trim()) { toast.error("Escreva uma resposta."); return; }
    setSavingResponse(true);
    try {
      await api.patch(`/admin/feedback/${feedbackId}/respond`, {
        admin_response: responseText.trim(),
        status: "resolved",
      });
      toast.success("Resposta enviada ao usuário por e-mail");
      setRespondingId(null);
      setResponseText("");
      await reloadFeedback();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao enviar resposta");
    } finally {
      setSavingResponse(false);
    }
  }

  async function deleteFeedback(feedbackId: string) {
    if (!confirm("Excluir este feedback permanentemente?")) return;
    try {
      await api.delete(`/admin/feedback/${feedbackId}`);
      toast.success("Feedback excluído");
      await reloadFeedback();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao excluir feedback");
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
          { label: "Sessões", value: stats?.sessions.total, icon: Activity, sub: "últ. 30 dias" },
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
      <div className="flex gap-2 border-b flex-wrap">
        {(["orgs", "users", "invites", "plans", "feedback"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "orgs" ? "Organizações" : t === "users" ? "Usuários" : t === "invites" ? "Convites" : t === "plans" ? "Planos" : `Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ""}`}
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
                            {PLAN_LABEL[org.subscription_plan ?? org.plan] ?? (org.subscription_plan ?? org.plan)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {org.users} usuários · {org.files} arquivos · criada em {formatDate(org.created_at)}
                        </p>
                        {org.trial_ends_at && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {(() => {
                              const days = Math.ceil((new Date(org.trial_ends_at!).getTime() - Date.now()) / 86400000);
                              return days > 0
                                ? <><span className="text-amber-600 dark:text-amber-400 font-medium">Trial: {days} {days === 1 ? "dia" : "dias"} restante{days !== 1 ? "s" : ""}</span></>
                                : <span className="text-destructive font-medium">Trial expirado há {Math.abs(days)} dias</span>;
                            })()}
                            <button
                              className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors"
                              title="Estender trial"
                              onClick={() => { setEditingTrialOrgId(org.id); setTrialDaysInput(30); }}
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </p>
                        )}
                        {!org.trial_ends_at && (
                          <button
                            className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 hover:text-foreground transition-colors"
                            onClick={() => { setEditingTrialOrgId(org.id); setTrialDaysInput(30); }}
                          >
                            <Clock className="h-3 w-3" /> Definir trial
                          </button>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={org.subscription_plan ?? org.plan}
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

                    {/* Trial editor */}
                    {editingTrialOrgId === org.id && (
                      <div className="mt-3 pt-3 border-t flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-medium text-muted-foreground shrink-0">Definir trial por:</span>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={trialDaysInput}
                          onChange={(e) => setTrialDaysInput(Number(e.target.value))}
                          className="w-24 h-8 text-sm"
                        />
                        <span className="text-sm text-muted-foreground shrink-0">dias a partir de hoje</span>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => updateTrialDays(org.id, trialDaysInput)}
                          disabled={savingTrial}
                        >
                          {savingTrial
                            ? <span className="h-3.5 w-3.5 border-2 border-t-transparent rounded-full animate-spin" />
                            : <><Save className="h-3.5 w-3.5 mr-1" />Salvar</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingTrialOrgId(null)}
                          disabled={savingTrial}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />Cancelar
                        </Button>
                      </div>
                    )}

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

      {/* ── Feedback ── */}
      {tab === "feedback" && (
        <div className="space-y-4">
          {feedbackLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : feedbackItems.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
              <MessageSquarePlus className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nenhum feedback recebido ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Tipo", "Título", "Descrição", "Usuário", "Organização", "Data", "Status", "Ações"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {feedbackItems.map((item) => (
                    <Fragment key={item.id}>
                    <tr className="border-t hover:bg-muted/20 transition-colors align-top">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${
                          item.type === "suggestion"
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                            : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800"
                        }`}>
                          {item.type === "suggestion"
                            ? <Lightbulb className="h-3 w-3" />
                            : <MessageSquarePlus className="h-3 w-3" />}
                          {item.type === "suggestion" ? "Sugestão" : "Reclamação"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[180px]">
                        <span className="line-clamp-2">{item.title}</span>
                        {item.admin_response && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[0.6rem] text-emerald-600 dark:text-emerald-400">
                            <CheckCheck className="h-3 w-3" /> Respondido
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[240px]">
                        <span className="line-clamp-3">{item.content}</span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="font-medium">{item.user_name || "—"}</div>
                        <div className="text-muted-foreground">{item.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {item.organization_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={item.status}
                          onValueChange={(v) => { if (v) updateFeedbackStatus(item.id, v); }}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue>
                              {(v: string | null) => v ? (FEEDBACK_STATUS_LABEL[v] ?? v) : "—"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FEEDBACK_STATUS_LABEL).map(([value, label]) => (
                              <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            onClick={() => {
                              setRespondingId(respondingId === item.id ? null : item.id);
                              setResponseText(item.admin_response ?? "");
                            }}
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
                            {item.admin_response ? "Editar" : "Responder"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => deleteFeedback(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {respondingId === item.id && (
                      <tr className="bg-muted/20 border-t">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="space-y-2 max-w-2xl">
                            <label className="text-xs font-medium text-muted-foreground">
                              Resposta ao usuário (enviada por e-mail para {item.user_email})
                            </label>
                            <textarea
                              value={responseText}
                              onChange={(e) => setResponseText(e.target.value)}
                              rows={3}
                              placeholder="Escreva sua resposta..."
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <Button size="sm" className="h-8" onClick={() => respondFeedback(item.id)} disabled={savingResponse || !responseText.trim()}>
                                {savingResponse
                                  ? <span className="h-3.5 w-3.5 border-2 border-t-transparent rounded-full animate-spin" />
                                  : <><Save className="h-3.5 w-3.5 mr-1" />Enviar resposta</>}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setRespondingId(null); setResponseText(""); }} disabled={savingResponse}>
                                <X className="h-3.5 w-3.5 mr-1" />Cancelar
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Planos ── */}
      {tab === "plans" && <PlanConfigTab />}

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
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Códigos gerados</CardTitle>
                  {inviteCodes && inviteCodes.some((c) => !c.used && !c.expired) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7"
                      onClick={deleteAllPendingCodes}
                      disabled={deletingAllCodes}
                    >
                      {deletingAllCodes ? (
                        <span className="h-3 w-3 border-2 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Excluir pendentes
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {codesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : codesError ? (
                  <p className="text-sm text-destructive text-center py-8">
                    Erro ao carregar códigos: {(codesError as Error)?.message ?? "verifique o console"}
                  </p>
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
                                    onClick={() => copyCode(c.code)}
                                    className="p-1 rounded hover:bg-muted transition-colors"
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
                                onClick={() => deleteInviteCode(c.id)}
                                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 transition-colors shrink-0 mt-0.5"
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

// ─── Plan Config Tab ──────────────────────────────────────────────────────────

const PLAN_ORDER = ["trial", "starter", "pro", "enterprise", "free"];
const PLAN_ACCENT: Record<string, string> = {
  trial:      "border-slate-300 dark:border-slate-600",
  starter:    "border-blue-400/60",
  pro:        "border-amber-400/60",
  enterprise: "border-purple-400/60",
  free:       "border-gray-300 dark:border-gray-600",
};

function PlanConfigTab() {
  const { data, isLoading, mutate: mutateConfigs } = useSWR<PlanConfigsResponse>(
    "/admin/plan-configs",
    fetcher
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const plans = [...(data?.plans ?? [])].sort(
    (a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id)
  );
  const availableFeatures = data?.available_features ?? [];

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Sobre preços e Stripe</p>
          <p className="text-xs mt-0.5 opacity-80">
            O valor aqui editado é exibido na página de Planos e registrado internamente.
            O valor <strong>efetivamente cobrado</strong> pelo Stripe é configurado separadamente via{" "}
            <code className="font-mono">STRIPE_PRICE_STARTER</code> /{" "}
            <code className="font-mono">STRIPE_PRICE_PRO</code>.
            Limites de usuários e arquivos entram em vigor imediatamente após salvar.
          </p>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            availableFeatures={availableFeatures}
            onSaved={mutateConfigs}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  availableFeatures,
  onSaved,
}: {
  plan: PlanConfig;
  availableFeatures: FeatureMeta[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft state for editing
  const [draft, setDraft] = useState<PlanConfig>(plan);

  function startEdit() {
    setDraft({ ...plan });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/admin/plan-configs/${plan.id}`, {
        name: draft.name,
        price_brl: draft.price_brl,
        price_label: draft.price_label,
        max_users: draft.max_users,
        max_files: draft.max_files,
        is_public: draft.is_public,
        features: draft.features,
        feature_flags: draft.feature_flags,
      });
      toast.success(`Plano "${draft.name}" atualizado`);
      onSaved();
      setEditing(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? "Erro ao salvar plano");
    } finally {
      setSaving(false);
    }
  }

  const accentClass = PLAN_ACCENT[plan.id] ?? "border-gray-200";

  return (
    <Card className={`border-2 ${accentClass} flex flex-col`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                className="w-full text-base font-semibold bg-transparent border-b border-amber-400 outline-none pb-0.5"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            ) : (
              <CardTitle className="text-base">{plan.name}</CardTitle>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Público badge */}
            {editing ? (
              <button
                onClick={() => setDraft({ ...draft, is_public: !draft.is_public })}
                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                  draft.is_public
                    ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950/40 dark:border-green-700 dark:text-green-400"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {draft.is_public ? "Público" : "Interno"}
              </button>
            ) : (
              <Badge
                variant={plan.is_public ? "default" : "secondary"}
                className="text-[10px] px-2 py-0"
              >
                {plan.is_public ? "Público" : "Interno"}
              </Badge>
            )}

            {/* Edit/Cancel */}
            {editing ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-600 hover:bg-green-50"
                  onClick={save}
                  disabled={saving}
                  title="Salvar"
                >
                  {saving
                    ? <span className="h-3.5 w-3.5 border-2 border-t-transparent rounded-full animate-spin" />
                    : <Save className="h-3.5 w-3.5" />
                  }
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={cancelEdit}
                  title="Cancelar"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={startEdit}
                title="Editar plano"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Price */}
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Rótulo de preço</label>
              <input
                className="w-full text-sm bg-transparent border-b border-amber-400 outline-none"
                value={draft.price_label}
                onChange={(e) => setDraft({ ...draft, price_label: e.target.value })}
                placeholder="R$ 197/mês"
              />
            </div>
            <div className="w-28">
              <label className="text-[10px] text-muted-foreground">Valor (centavos)</label>
              <input
                type="number"
                className="w-full text-sm bg-transparent border-b border-amber-400 outline-none"
                value={draft.price_brl}
                onChange={(e) => setDraft({ ...draft, price_brl: Number(e.target.value) })}
              />
            </div>
          </div>
        ) : (
          <p className="text-2xl font-bold mt-1">{plan.price_label}</p>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Limits */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            {editing ? (
              <input
                type="number"
                className="w-full text-center text-sm font-semibold bg-transparent border-b border-amber-400 outline-none"
                value={draft.max_users === 9999 ? "" : draft.max_users}
                placeholder="∞"
                onChange={(e) => setDraft({
                  ...draft,
                  max_users: e.target.value === "" ? 9999 : Number(e.target.value),
                })}
              />
            ) : (
              <p className="text-sm font-semibold">
                {plan.max_users >= 9999 ? "∞" : plan.max_users}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">Usuários</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <FileSpreadsheet className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            {editing ? (
              <input
                type="number"
                className="w-full text-center text-sm font-semibold bg-transparent border-b border-amber-400 outline-none"
                value={draft.max_files === 9999 ? "" : draft.max_files}
                placeholder="∞"
                onChange={(e) => setDraft({
                  ...draft,
                  max_files: e.target.value === "" ? 9999 : Number(e.target.value),
                })}
              />
            ) : (
              <p className="text-sm font-semibold">
                {plan.max_files >= 9999 ? "∞" : plan.max_files}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">Arquivos</p>
          </div>
        </div>

        {/* Feature flags */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Funcionalidades</p>
          <div className="space-y-1.5">
            {availableFeatures.map((feat) => {
              const active = editing
                ? (draft.feature_flags[feat.key] ?? false)
                : (plan.feature_flags[feat.key] ?? false);

              return (
                <div key={feat.key} className="flex items-center gap-2">
                  {editing ? (
                    <button
                      onClick={() =>
                        setDraft({
                          ...draft,
                          feature_flags: {
                            ...draft.feature_flags,
                            [feat.key]: !draft.feature_flags[feat.key],
                          },
                        })
                      }
                      className={`h-4 w-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        active
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {active && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                  ) : (
                    active
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                  )}
                  <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {feat.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Free-text features */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Descrição na página de planos
          </p>
          {editing ? (
            <textarea
              rows={5}
              className="w-full text-xs border rounded-lg p-2 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 bg-muted/20"
              placeholder={"Uma feature por linha"}
              value={draft.features.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  features: e.target.value.split("\n"),
                })
              }
            />
          ) : (
            <ul className="space-y-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stripe ID (read-only) */}
        {plan.stripe_price_id && (
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            Stripe: {plan.stripe_price_id}
          </p>
        )}
      </CardContent>
    </Card>
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
