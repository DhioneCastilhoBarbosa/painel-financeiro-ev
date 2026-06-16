"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
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
    new_password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
    confirm:      z.string(),
  })
  .refine((d) => d.new_password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token");

  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) setInvalid(true);
  }, [token]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm: "" },
  });

  const onSubmit = async (values: FormData) => {
    if (!token) return;
    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        new_password: values.new_password,
      });
      setDone(true);
      toast.success("Senha redefinida com sucesso!");
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      const msg = apiErrMsg(err, "Não foi possível redefinir a senha.");
      if (msg.toLowerCase().includes("inválido") || msg.toLowerCase().includes("expirado")) {
        setInvalid(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl border-0">
      <CardHeader className="text-center space-y-3 pb-6">
        <div className="relative flex justify-center items-center">
          <Link
            href="/login"
            className="absolute left-0 flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
            style={{ color: DARK }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <Logo height={36} />
        </div>
        <div className="flex justify-center">
          <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: GREEN }} />
        </div>
        <CardTitle className="text-xl">
          {done ? "Senha redefinida" : invalid ? "Link inválido" : "Redefinir senha"}
        </CardTitle>
        <CardDescription>
          {done
            ? "Sua senha foi atualizada. Redirecionando para o login..."
            : invalid
            ? "Este link é inválido ou já expirou. Solicite um novo link."
            : "Crie uma nova senha para sua conta."}
        </CardDescription>
      </CardHeader>

      {done && (
        <CardContent className="pb-6 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: GREEN }} />
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium underline"
            style={{ color: DARK }}
          >
            Ir para o login agora
          </Link>
        </CardContent>
      )}

      {invalid && !done && (
        <CardContent className="pb-6 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: DARK, color: "#fff" }}
          >
            Solicitar novo link
          </Link>
        </CardContent>
      )}

      {!done && !invalid && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
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
                    <FormLabel>Confirmar nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repita a senha" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pb-6">
              <Button
                type="submit"
                className="w-full font-semibold"
                disabled={loading}
                style={{ backgroundColor: DARK, color: "#fff" }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar nova senha
              </Button>
            </CardFooter>
          </form>
        </Form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
