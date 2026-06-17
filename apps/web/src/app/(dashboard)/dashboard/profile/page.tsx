"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import api from "@/lib/api";
import { ROLE_LABELS } from "@/lib/permissions";
import { UserCircle, Lock, Building2, Mail, ShieldCheck } from "lucide-react";
import { PasswordStrengthChecker, PasswordMatchIndicator } from "@/components/ui/PasswordStrength";
import { passwordValid } from "@/lib/password";

export default function ProfilePage() {
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [nameLoading, setNameLoading] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const initials = user?.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === user?.name) return;
    setNameLoading(true);
    try {
      await api.patch("/auth/me", { name: name.trim() });
      await refresh();
      toast.success("Nome atualizado com sucesso");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao atualizar nome");
    } finally {
      setNameLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValid(newPw)) {
      toast.error("A nova senha não atende aos critérios de segurança");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("As senhas não coincidem");
      return;
    }
    setPwLoading(true);
    try {
      await api.patch("/auth/me", { current_password: currentPw, new_password: newPw });
      toast.success("Senha alterada com sucesso");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao alterar senha");
    } finally {
      setPwLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-input bg-transparent dark:bg-input/30 px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle className="h-6 w-6 text-primary" />
          Meu Perfil
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie suas informações pessoais e senha de acesso</p>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4 mb-5">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold bg-primary/15 text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-base">{user?.name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg border dark:border-white/10 p-3">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Organização</p>
                <p className="font-medium">{user?.organization_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border dark:border-white/10 p-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Papel</p>
                <Badge variant="secondary" className="text-xs mt-0.5">
                  {user ? ROLE_LABELS[user.role] : "—"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-primary" />
            Alterar nome
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
                placeholder="Seu nome"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={nameLoading || !name.trim() || name.trim() === user?.name}
            >
              {nameLoading ? "Salvando..." : "Salvar nome"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Senha atual</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className={inputClass}
                placeholder="Crie uma senha forte"
                autoComplete="new-password"
                required
              />
              <PasswordStrengthChecker password={newPw} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className={inputClass}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                required
              />
              <PasswordMatchIndicator password={newPw} confirm={confirmPw} />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={pwLoading || !currentPw || !passwordValid(newPw) || !confirmPw || newPw !== confirmPw}
            >
              {pwLoading ? "Alterando..." : "Alterar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
