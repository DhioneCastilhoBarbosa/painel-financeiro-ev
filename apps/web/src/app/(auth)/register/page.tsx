"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
}).refine((d) => d.password === d.confirm_password, {
  message: "As senhas não coincidem",
  path: ["confirm_password"],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", organization_name: "", email: "", password: "", confirm_password: "" },
  });

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      await api.post("/auth/register", {
        name:              values.name,
        email:             values.email,
        password:          values.password,
        organization_name: values.organization_name,
      });
      toast.success("Conta criada! Verifique seu e-mail para ativar.");
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
        {/* Logo */}
        <div className="flex justify-center">
          <Logo height={36} />
        </div>

        {/* Divider accent */}
        <div className="flex justify-center">
          <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: GREEN }} />
        </div>

        <CardTitle className="text-xl">Criar conta gratuita</CardTitle>
        <CardDescription>14 dias de trial sem cartão de crédito</CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Seu nome</FormLabel>
                <FormControl>
                  <Input placeholder="João Silva" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="organization_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da empresa</FormLabel>
                <FormControl>
                  <Input placeholder="Eletropostos Ltda" {...field} />
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
              Criar conta
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
