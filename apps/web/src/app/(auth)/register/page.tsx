"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Building2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import api, { apiErrMsg } from "@/lib/api";

const GREEN = "#06CB3F";
const DARK  = "#163134";

const schema = z.object({
  name:              z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  organization_name: z.string().min(2, "Nome da empresa deve ter pelo menos 2 caracteres"),
  email:             z.string().email("E-mail inválido"),
  password:          z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  confirm_password:  z.string(),
  invite_code:       z.string().min(16, "Código deve ter pelo menos 16 caracteres"),
}).refine((d) => d.password === d.confirm_password, {
  message: "As senhas não coincidem",
  path: ["confirm_password"],
});

type FormData = z.infer<typeof schema>;

interface InviteLookup {
  checking: boolean;
  valid: boolean | null;
  type: "invitation" | "org_invite_code" | null;
  org_name?: string;
  email?: string;
  role?: string;
  error?: string;
}

export default function RegisterPage() {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<InviteLookup>({ checking: false, valid: null, type: null });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", organization_name: "", email: "", password: "", confirm_password: "", invite_code: "" },
  });

  const inviteCode = form.watch("invite_code");

  // Lookup debounced quando o código atingir ≥16 chars
  const doLookup = useCallback(async (code: string) => {
    if (code.length < 16) {
      setLookup({ checking: false, valid: null, type: null });
      return;
    }
    setLookup(prev => ({ ...prev, checking: true }));
    try {
      const { data } = await api.get(`/auth/invite-lookup?token=${encodeURIComponent(code)}`);
      if (data.valid) {
        setLookup({ checking: false, valid: true, type: data.type, org_name: data.org_name, email: data.email, role: data.role });
        // Convite de membro: auto-preenche o nome da organização
        if (data.type === "invitation" && data.org_name) {
          form.setValue("organization_name", data.org_name);
        }
      } else {
        setLookup({ checking: false, valid: false, type: null, error: data.error });
      }
    } catch {
      setLookup({ checking: false, valid: false, type: null, error: "Erro ao verificar código" });
    }
  }, [form]);

  useEffect(() => {
    const timer = setTimeout(() => doLookup(inviteCode), 500);
    return () => clearTimeout(timer);
  }, [inviteCode, doLookup]);

  const isInvitation = lookup.valid && lookup.type === "invitation";

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        name:              values.name,
        email:             values.email,
        password:          values.password,
        organization_name: values.organization_name,
        invite_code:       values.invite_code.trim(),
      });
      if (res.data?.joined_org) {
        toast.success("Conta criada! Você já pode entrar.");
      } else {
        toast.success("Conta criada! Verifique seu e-mail para ativar.");
      }
      router.push("/login");
    } catch (err: unknown) {
      toast.error(apiErrMsg(err, "Erro ao criar conta"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl border-0">
      <CardHeader className="text-center space-y-3 pb-6">
        <div className="flex justify-center">
          <Logo height={36} />
        </div>
        <div className="flex justify-center">
          <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: GREEN }} />
        </div>
        <CardTitle className="text-xl">
          {isInvitation ? `Ingressar em ${lookup.org_name}` : "Criar conta gratuita"}
        </CardTitle>
        <CardDescription>
          {isInvitation
            ? "Você foi convidado para fazer parte desta organização"
            : "14 dias de trial sem cartão de crédito"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Código de convite — exibido primeiro para ativar o flow correto */}
            <FormField control={form.control} name="invite_code" render={({ field }) => (
              <FormItem>
                <FormLabel>Código de convite</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="Cole aqui o código ou token de convite"
                      className="font-mono text-sm pr-8"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.trim())}
                    />
                    {field.value.length >= 16 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        {lookup.checking
                          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          : lookup.valid
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <XCircle className="h-4 w-4 text-destructive" />}
                      </span>
                    )}
                  </div>
                </FormControl>
                {/* Banner de resultado do lookup */}
                {lookup.valid && lookup.type === "invitation" && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2 mt-1">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Convite válido · ingressará em <strong>{lookup.org_name}</strong></span>
                  </div>
                )}
                {lookup.valid && lookup.type === "org_invite_code" && (
                  <p className="text-xs text-emerald-600 mt-1">✓ Código de convite válido — nova organização será criada</p>
                )}
                {lookup.valid === false && lookup.error && field.value.length >= 16 && (
                  <p className="text-xs text-destructive mt-1">{lookup.error}</p>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Seu nome</FormLabel>
                <FormControl>
                  <Input placeholder="João Silva" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Org name: auto-preenchido e bloqueado quando é invitation */}
            <FormField control={form.control} name="organization_name" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  Nome da empresa
                  {isInvitation && (
                    <span className="text-[0.65rem] font-normal text-muted-foreground">(definido pelo convite)</span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Eletropostos Ltda"
                    readOnly={isInvitation}
                    className={isInvitation ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="voce@empresa.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="confirm_password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isInvitation ? `Ingressar em ${lookup.org_name}` : "Criar conta"}
            </Button>
          </form>
        </Form>
      </CardContent>

      <CardFooter className="justify-center text-sm text-muted-foreground pb-6">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="ml-1 font-semibold hover:underline transition-colors"
          style={{ color: GREEN }}
        >
          Entrar
        </Link>
      </CardFooter>
    </Card>
  );
}
