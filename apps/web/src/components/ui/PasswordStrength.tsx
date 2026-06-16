"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { passwordRules } from "@/lib/password";

const GREEN = "#06CB3F";

const CRITERIA = [
  { key: "minLength" as const, label: "Mínimo 8 caracteres" },
  { key: "uppercase" as const, label: "Uma letra maiúscula" },
  { key: "lowercase" as const, label: "Uma letra minúscula" },
  { key: "digit"     as const, label: "Um número" },
  { key: "special"   as const, label: "Um caractere especial" },
];

export function PasswordStrengthChecker({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {CRITERIA.map(({ key, label }) => {
        const met = passwordRules[key](password);
        return (
          <li key={key} className="flex items-center gap-2 text-xs">
            {met
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: GREEN }} />
              : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className={met ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordMatchIndicator({
  password,
  confirm,
}: {
  password: string;
  confirm: string;
}) {
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p className={`flex items-center gap-1.5 text-xs mt-1 ${match ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
      {match
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        : <XCircle className="h-3.5 w-3.5 shrink-0" />}
      {match ? "Senhas coincidem" : "Senhas não coincidem"}
    </p>
  );
}
