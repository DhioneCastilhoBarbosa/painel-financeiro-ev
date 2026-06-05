"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const schema = z.object({
  email: z.string().email("E-mail inválido"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: values.email });
      setSent(true);
      toast.success("Se o e-mail estiver cadastrado, você receberá as instruções.");
    } catch (err) {
      toast.error(apiErrMsg(err, "Não foi possível enviar o e-mail."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl border-0">
      <CardHeader className="text-center space-y-3 pb-6">
        {/* Logo + back */}
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

        {/* Divider accent */}
        <div className="flex justify-center">
          <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: GREEN }} />
        </div>

        <CardTitle className="text-xl">
          {sent ? "E-mail enviado" : "Esqueci minha senha"}
        </CardTitle>
        <CardDescription>
          {sent
            ? "Verifique sua caixa de entrada e a pasta de spam."
            : "Informe o e-mail da sua conta para receber o link de redefinição."}
        </CardDescription>
      </CardHeader>

      {!sent ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="voce@empresa.com"
                        {...field}
                      />
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
                style={{ backgroundColor: DARK }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link de redefinição
              </Button>
            </CardFooter>
          </form>
        </Form>
      ) : (
        <CardContent className="pb-6 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: GREEN }} />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full mt-2")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
