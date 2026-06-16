"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import api, { apiErrMsg } from "@/lib/api";

const GREEN = "#06CB3F";
const DARK  = "#163134";

const schema = z
  .object({
    name:     z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
    password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
    confirm:  z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

type InviteInfo = {
  org_name: string;
  email: string;
  role: string;
};

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token");

  const [phase, setPhase]   = useState<"loading" | "form" | "done" | "error">("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "", confirm: "" },
  });

  useEffect(() => {
    if (!token) {
      setErrMsg("Link de convite inválido.");
      setPhase("error");
      return;
    }
    api
      .get(`/auth/invite-lookup?token=${encodeURIComponent(token)}`)
      .then((res) => {
        const data = res.data;
        if (!data.valid) {
          setErrMsg(data.error ?? "Convite inválido ou expirado.");
          setPhase("error");
          return;
        }
        if (data.type === "org_invite_code") {
          // Código de org — redireciona para o registro completo
          router.replace(`/register?invite_code=${encodeURIComponent(token)}`);
          return;
        }
        setInvite({ org_name: data.org_name, email: data.email, role: data.role });
        setPhase("form");
      })
      .catch(() => {
        setErrMsg("Não foi possível validar o convite.");
        setPhase("error");
      });
  }, [token, router]);

  const onSubmit = async (values: FormData) => {
    if (!invite || !token) return;
    setSubmitting(true);
    try {
      await api.post("/auth/register", {
        name:              values.name,
        email:             invite.email,
        password:          values.password,
        organization_name: invite.org_name,
        invite_code:       token,
      });
      toast.success("Conta criada com sucesso!");
      setPhase("done");
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      toast.error(apiErrMsg(err, "Não foi possível criar a conta."));
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel: Record<string, string> = {
    owner:   "Proprietário",
    admin:   "Administrador",
    analyst: "Analista",
    viewer:  "Visualizador",
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
          {phase === "loading" && "Carregando convite..."}
          {phase === "form"    && `Você foi convidado para ${invite?.org_name}`}
          {phase === "done"    && "Conta criada"}
          {phase === "error"   && "Link inválido"}
        </CardTitle>

        <CardDescription>
          {phase === "loading" && "Validando o link de convite."}
          {phase === "form"    && `Crie sua senha para ingressar como ${roleLabel[invite?.role ?? ""] ?? invite?.role}.`}
          {phase === "done"    && "Redirecionando para o login..."}
          {phase === "error"   && errMsg}
        </CardDescription>
      </CardHeader>

      {phase === "loading" && (
        <CardContent className="pb-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto animate-spin" style={{ color: GREEN }} />
        </CardContent>
      )}

      {phase === "done" && (
        <CardContent className="pb-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: GREEN }} />
          <Link href="/login" className="text-sm font-medium underline" style={{ color: DARK }}>
            Ir para o login agora
          </Link>
        </CardContent>
      )}

      {phase === "error" && (
        <CardContent className="pb-8 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-5 text-red-500" />
          <p className="text-sm text-muted-foreground mb-4">
            O link pode ter expirado (válido por 48 horas) ou já foi utilizado.
            Solicite um novo convite ao administrador da organização.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: DARK, color: "#fff" }}
          >
            Voltar ao login
          </Link>
        </CardContent>
      )}

      {phase === "form" && invite && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {/* E-mail pré-preenchido e bloqueado */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">E-mail</label>
                <Input value={invite.email} disabled className="opacity-70 cursor-not-allowed" />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seu nome completo</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repita a senha" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>

            <CardFooter className="pb-6">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ backgroundColor: DARK, color: "#fff" }}
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <UserPlus className="h-4 w-4" />}
                Criar conta e ingressar
              </button>
            </CardFooter>
          </form>
        </Form>
      )}
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
