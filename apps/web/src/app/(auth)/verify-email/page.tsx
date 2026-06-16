"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import api, { apiErrMsg } from "@/lib/api";

const GREEN = "#06CB3F";
const DARK  = "#163134";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Token de verificação não encontrado na URL.");
      setStatus("error");
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((err) => {
        setErrorMsg(apiErrMsg(err, "Token inválido ou expirado."));
        setStatus("error");
      });
  }, [token]);

  return (
    <Card className="w-full max-w-md shadow-2xl border-0">
      <CardHeader className="text-center space-y-3 pb-4">
        <div className="flex justify-center">
          <Logo height={36} />
        </div>
        <div className="flex justify-center">
          <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: GREEN }} />
        </div>
        <CardTitle className="text-xl">
          {status === "loading" && "Verificando e-mail..."}
          {status === "success" && "E-mail verificado"}
          {status === "error" && "Verificação falhou"}
        </CardTitle>
        <CardDescription>
          {status === "loading" && "Aguarde enquanto confirmamos seu endereço de e-mail."}
          {status === "success" && "Sua conta está ativa. Você já pode fazer login."}
          {status === "error" && errorMsg}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-8 text-center">
        {status === "loading" && (
          <Loader2 className="h-12 w-12 mx-auto animate-spin" style={{ color: GREEN }} />
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto mb-5" style={{ color: GREEN }} />
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: DARK, color: "#fff" }}
            >
              Ir para o login
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto mb-5 text-red-500" />
            <p className="text-sm text-muted-foreground mb-4">
              O link pode ter expirado (válido por 1 hora) ou já foi utilizado.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: DARK, color: "#fff" }}
            >
              Voltar ao login
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
