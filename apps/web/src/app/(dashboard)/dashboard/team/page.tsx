"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2, Mail, UserPlus, Trash2, Crown, ShieldCheck,
  Plus, Pencil, ChevronDown, ChevronUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/format";
import useSWR, { mutate } from "swr";
import type { CustomRole, Permission } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// ── Schemas ───────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email("E-mail inválido"),
  // valor = "admin" | "analyst" | "viewer" | "<custom_role_id>"
  roleKey: z.string().min(1, "Selecione um cargo"),
});
type InviteData = z.infer<typeof inviteSchema>;

const roleFormSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100).refine(
    (v) => v.trim().toLowerCase() !== "master",
    { message: "O nome 'Master' é reservado pelo sistema. Use outro nome." }
  ),
  description: z.string().optional(),
});
type RoleFormData = z.infer<typeof roleFormSchema>;

// ── Constantes ────────────────────────────────────────────────────────────────

const BUILTIN_ROLE_LABELS: Record<string, string> = {
  owner:   "Proprietário",
  admin:   "Administrador",
  analyst: "Analista",
  viewer:  "Visualizador",
};

const BUILTIN_INVITE_OPTIONS = [
  { key: "admin",   label: "Administrador" },
  { key: "analyst", label: "Analista" },
  { key: "viewer",  label: "Visualizador" },
];

const BUILTIN_ROLE_COLORS: Record<string, string> = {
  owner:   "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800",
  admin:   "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800",
  analyst: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
  viewer:  "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700",
};

const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard:   "Ver Dashboard (KPIs e séries temporais)",
  view_stations:    "Ver Estações & Conectores",
  view_users:       "Ver Análise de Usuários",
  view_investment:  "Ver Análise de Investimento",
  import_files:     "Importar arquivos",
  delete_files:     "Excluir arquivos",
  manage_alerts:    "Configurar Alertas",
  manage_settings:  "Configurações e Custos",
  manage_team:      "Gerenciar Equipe",
  view_billing:     "Ver Cobrança / Plano",
  view_audit:       "Ver Log de Auditoria",
  // Leads
  view_leads:       "Ver Leads (lista, detalhes e exportar)",
  manage_leads:     "Configurar Leads (simulador e notificações)",
};

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

const EMPTY_PERMISSIONS: Record<Permission, boolean> = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p, false])
) as Record<Permission, boolean>;

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  custom_role_id: string | null;
  last_login_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  custom_role_name?: string | null;
  role: string;
  expires_at: string;
}

// ── Componente RoleEditor ─────────────────────────────────────────────────────

function RoleEditor({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<CustomRole> & { permissions?: Record<Permission, boolean> };
  onSave: (name: string, description: string, permissions: Record<Permission, boolean>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: initial.name ?? "", description: initial.description ?? "" },
  });
  const [perms, setPerms] = useState<Record<Permission, boolean>>(
    initial.permissions ?? EMPTY_PERMISSIONS
  );

  const togglePerm = (p: Permission) => setPerms((prev) => ({ ...prev, [p]: !prev[p] }));

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSave(data.name, data.description ?? "", perms);
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Nome do role</FormLabel>
              <FormControl><Input className="h-8" placeholder="ex: Operador" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Descrição (opcional)</FormLabel>
              <FormControl><Input className="h-8" placeholder="ex: Acesso somente leitura" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Permissões do cargo</p>
          <div className="grid grid-cols-1 gap-2">
            {ALL_PERMISSIONS.map((p) => (
              <div key={p} className="flex items-center gap-3 py-1 border-b last:border-0 dark:border-slate-800">
                <Switch
                  id={`perm-${p}`}
                  checked={perms[p]}
                  onCheckedChange={() => togglePerm(p)}
                />
                <Label htmlFor={`perm-${p}`} className="text-sm cursor-pointer flex-1">
                  {PERMISSION_LABELS[p]}
                </Label>
                <span className={`text-[0.6rem] font-medium px-1.5 py-0.5 rounded ${
                  perms[p]
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}>
                  {perms[p] ? "Permitido" : "Bloqueado"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salvar cargo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    </Form>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const SWR_OPTS = { revalidateOnFocus: false, revalidateOnReconnect: false };
  const { data: members, isLoading: membersLoading } = useSWR<Member[]>("/org/members", fetcher, SWR_OPTS);
  const { data: invitations, isLoading: invLoading } = useSWR<Invitation[]>("/org/invitations", fetcher, SWR_OPTS);
  const { data: customRoles, isLoading: rolesLoading } = useSWR<CustomRole[]>(
    user?.role === "owner" || user?.role === "admin" ? "/org/custom-roles" : null,
    fetcher,
    SWR_OPTS
  );

  const [inviting, setInviting] = useState(false);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [assigningMember, setAssigningMember] = useState<{ memberId: string; roleId: string } | null>(null);

  const form = useForm<InviteData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", roleKey: "" },
  });

  const canManage = user?.role === "owner" || user?.role === "admin";
  const isAdmin = canManage; // alias mais claro

  // ── Invite ────────────────────────────────────────────────────────────────

  const onInvite = async (values: InviteData) => {
    setInviting(true);
    try {
      const builtinKeys = ["admin", "analyst", "viewer"];
      const isBuiltin = builtinKeys.includes(values.roleKey);
      const payload = isBuiltin
        ? { email: values.email, role: values.roleKey }
        : { email: values.email, role: "analyst", custom_role_id: values.roleKey };

      await api.post("/org/members/invite", payload);
      toast.success(`Convite enviado para ${values.email}`);
      form.reset({ email: "", roleKey: "" });
      mutate("/org/invitations");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao enviar convite");
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`Remover ${name} da equipe?`)) return;
    try {
      await api.delete(`/org/members/${id}`);
      toast.success("Membro removido");
      mutate("/org/members");
    } catch {
      toast.error("Erro ao remover membro");
    }
  };

  const cancelInvite = async (id: string) => {
    try {
      await api.delete(`/org/invitations/${id}`);
      toast.success("Convite cancelado");
      mutate("/org/invitations");
    } catch {
      toast.error("Erro ao cancelar convite");
    }
  };

  // ── Custom Roles ──────────────────────────────────────────────────────────

  const saveRole = async (name: string, description: string, permissions: Record<Permission, boolean>) => {
    setSavingRole(true);
    try {
      if (editingRole) {
        await api.put(`/org/custom-roles/${editingRole.id}`, { name, description, permissions });
        toast.success("Role atualizado");
      } else {
        await api.post("/org/custom-roles", { name, description, permissions });
        toast.success("Role criado");
      }
      setShowRoleEditor(false);
      setEditingRole(null);
      mutate("/org/custom-roles");
    } catch {
      toast.error("Erro ao salvar role");
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = async (id: string, name: string) => {
    if (!confirm(`Excluir o cargo "${name}"? Membros com este cargo voltarão para o cargo padrão.`)) return;
    try {
      await api.delete(`/org/custom-roles/${id}`);
      toast.success("Role excluído");
      mutate("/org/custom-roles");
      mutate("/org/members");
    } catch {
      toast.error("Erro ao excluir role");
    }
  };

  const assignRole = async (memberId: string, roleId: string) => {
    setAssigningMember({ memberId, roleId });
    try {
      await api.post(`/org/custom-roles/${roleId}/assign/${memberId}`);
      toast.success("Role atribuído");
      mutate("/org/members");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao atribuir role");
    } finally {
      setAssigningMember(null);
    }
  };

  const removeCustomRole = async (memberId: string, roleId: string) => {
    setAssigningMember({ memberId, roleId });
    try {
      await api.delete(`/org/custom-roles/${roleId}/assign/${memberId}`);
      toast.success("Role removido — voltou para role padrão");
      mutate("/org/members");
    } catch {
      toast.error("Erro ao remover role");
    } finally {
      setAssigningMember(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getRoleBadge = (m: Member) => {
    if (m.custom_role_id) {
      const cr = customRoles?.find((r) => r.id === m.custom_role_id);
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          {cr?.name ?? "Custom"}
        </span>
      );
    }
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${BUILTIN_ROLE_COLORS[m.role] ?? BUILTIN_ROLE_COLORS.viewer}`}>
        {BUILTIN_ROLE_LABELS[m.role] ?? m.role}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Equipe</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie os membros e roles da sua organização</p>
      </div>

      {/* ── Gerenciar Roles (admin only) ─────────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <div>
                  <CardTitle className="text-base">Gerenciar Cargos</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Crie cargos personalizados com permissões específicas para sua equipe
                  </CardDescription>
                </div>
              </div>
              {!showRoleEditor && (
                <Button size="sm" onClick={() => { setEditingRole(null); setShowRoleEditor(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Novo cargo
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Formulário de criação/edição */}
            {showRoleEditor && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4">
                <p className="text-sm font-semibold mb-3">
                  {editingRole ? `Editando: ${editingRole.name}` : "Novo cargo personalizado"}
                </p>
                <RoleEditor
                  initial={editingRole ?? {}}
                  onSave={saveRole}
                  onCancel={() => { setShowRoleEditor(false); setEditingRole(null); }}
                  saving={savingRole}
                />
              </div>
            )}

            {/* Lista de roles existentes */}
            {rolesLoading ? (
              <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : !customRoles?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum cargo personalizado criado. Clique em &quot;Novo cargo&quot; para começar.
              </p>
            ) : (
              customRoles.map((role) => (
                <div key={role.id} className="rounded-lg border dark:border-slate-800">
                  {/* Header do role */}
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{role.name}</p>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {role.member_count} membro{role.member_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {role.description && (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                        title="Ver permissões"
                      >
                        {expandedRole === role.id
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-slate-500"
                        onClick={() => { setEditingRole(role); setShowRoleEditor(true); }}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                        onClick={() => deleteRole(role.id, role.name)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Permissões expandidas */}
                  {expandedRole === role.id && (
                    <div className="border-t dark:border-slate-800 px-3 pb-3 pt-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {ALL_PERMISSIONS.map((p) => (
                          <div key={p} className="flex items-center gap-2 text-xs py-0.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${role.permissions[p] ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                            <span className={role.permissions[p] ? "text-foreground" : "text-muted-foreground line-through"}>
                              {PERMISSION_LABELS[p]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Membros ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Membros</span>
            <Badge variant="secondary">{members?.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {membersLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
            : members?.map((m) => {
              const initials = m.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
              const isMe = m.id === user?.id;
              const canHaveCustomRole = m.role !== "owner" && m.role !== "admin";
              return (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b last:border-0 dark:border-slate-800">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{m.name} {isMe && <span className="text-muted-foreground">(você)</span>}</p>
                      {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>

                  {/* Badge de role */}
                  {getRoleBadge(m)}

                  {/* Atribuir custom role (admin only, para analyst/viewer) */}
                  {isAdmin && !isMe && canHaveCustomRole && (customRoles?.length ?? 0) > 0 && (
                    <Select
                      value={m.custom_role_id ?? "__builtin__"}
                      onValueChange={(val) => {
                        if (val === "__builtin__" && m.custom_role_id) {
                          removeCustomRole(m.id, m.custom_role_id);
                        } else if (val && val !== "__builtin__") {
                          assignRole(m.id, val);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs" disabled={assigningMember?.memberId === m.id}>
                        {assigningMember?.memberId === m.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <SelectValue placeholder="Role padrão" />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__builtin__" className="text-xs">
                          Cargo padrão ({BUILTIN_ROLE_LABELS[m.role] ?? m.role})
                        </SelectItem>
                        {customRoles?.map((r) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {canManage && !isMe && m.role !== "owner" && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => removeMember(m.id, m.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
        </CardContent>
      </Card>

      {/* ── Convites pendentes ────────────────────────────────────────────── */}
      {(invitations?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Convites Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invLoading
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12" />)
              : invitations?.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 py-2 border-b last:border-0 dark:border-slate-800">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.custom_role_name ?? BUILTIN_ROLE_LABELS[inv.role] ?? inv.role} · Expira {formatDate(inv.expires_at)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800">Pendente</Badge>
                  {canManage && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                      onClick={() => cancelInvite(inv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── Convidar membro ───────────────────────────────────────────────── */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Convidar Membro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onInvite)} className="flex gap-3">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input type="email" placeholder="colaborador@empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="roleKey" render={({ field }) => {
                  const hasCustom = (customRoles?.length ?? 0) > 0;
                  return (
                    <FormItem>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-44">
                            <SelectValue placeholder="Selecionar cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {/* Cargos integrados sempre disponíveis */}
                          {BUILTIN_INVITE_OPTIONS.map((o) => (
                            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                          ))}
                          {/* Cargos personalizados (se existirem) */}
                          {hasCustom && customRoles!.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }} />
                <Button type="submit" disabled={inviting}>
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Convidar"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
