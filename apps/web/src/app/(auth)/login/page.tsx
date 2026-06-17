"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";

const GREEN = "#06CB3F";
const DARK = "#163134";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [user, authLoading, router]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const httpErr = err as { response?: { status?: number; data?: { detail?: string } } };
      const httpStatus = httpErr?.response?.status;
      const detail = httpErr?.response?.data?.detail;
      if (httpStatus === 403) {
        toast.error(detail ?? "Acesso bloqueado. Entre em contato com o suporte Intelbras.", { duration: 6000 });
      } else {
        toast.error("E-mail ou senha incorretos");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl border-0">
      <CardHeader className="text-center space-y-3 pb-6">
        {/* Voltar + Logo */}
        <div className="relative flex justify-center items-center">
          <Link
            href="/"
            className="absolute left-0 flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70 text-[#163134] dark:text-muted-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <Logo height={36} />
        </div>

        {/* Divider accent */}
        <div className="flex justify-center">
          <div
            className="h-0.5 w-10 rounded-full"
            style={{ backgroundColor: GREEN }}
          />
        </div>

        <CardTitle className="text-xl">Entrar na sua conta</CardTitle>
        <CardDescription>Gestão financeira para eletropostos</CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="voce@empresa.com"
                      autoComplete="email"
                      {...field}
                    />
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Senha</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium hover:underline transition-colors"
                      style={{ color: GREEN }}
                    >
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full font-semibold"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </Form>
      </CardContent>

      <CardFooter className="justify-center text-sm text-muted-foreground pb-6">
        Não tem conta?{" "}
        <Link
          href="/register"
          className="ml-1 font-semibold hover:underline transition-colors"
          style={{ color: GREEN }}
        >
          Cadastre-se grátis
        </Link>
      </CardFooter>
    </Card>
  );
}
