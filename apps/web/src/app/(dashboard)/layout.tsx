"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { FilterURLSync } from "@/components/FilterURLSync";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { RoleGuard } from "@/components/RoleGuard";
import { TrialBanner } from "@/components/TrialBanner";
import { AlertBell } from "@/components/AlertBell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <FilterProvider>
      <Suspense>
        <FilterURLSync />
      </Suspense>
      <div className="flex h-screen overflow-hidden bg-[#EFEFED] dark:bg-slate-950">
        <Sidebar className="max-md:hidden" />
        <main className="flex-1 overflow-y-auto flex flex-col">
          <MobileNav />
          <div className="flex items-center">
            <div className="flex-1"><TrialBanner /></div>
            <div className="px-3 py-1.5 shrink-0 print:hidden">
              <AlertBell />
            </div>
          </div>
          <div className="flex-1">
            <RoleGuard>{children}</RoleGuard>
          </div>
        </main>
      </div>
    </FilterProvider>
  );
}
