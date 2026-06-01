"use client";

import Link from "next/link";
import { Zap, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Subscription {
  plan: string;
  status: string;
  trial_ends_at: string | null;
}

export function TrialBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const { data: sub } = useSWR<Subscription>(user ? "/billing/subscription" : null, fetcher);

  if (dismissed || !sub) return null;
  if (sub.status !== "trialing" || !sub.trial_ends_at) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000));

  // Only show when 7 days or fewer remain
  if (daysLeft > 7) return null;

  const urgent = daysLeft <= 2;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2 text-sm border-b",
      urgent
        ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
        : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
    )}>
      <Zap className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {daysLeft === 0
          ? "Seu período de trial expirou."
          : `Seu trial expira em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}.`
        }{" "}
        Escolha um plano para continuar.
      </span>
      <Link
        href="/dashboard/billing"
        className={cn(buttonVariants({ variant: urgent ? "default" : "outline", size: "sm" }), "h-7 text-xs")}
      >
        Ver planos
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-current opacity-60 hover:opacity-100 shrink-0"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
