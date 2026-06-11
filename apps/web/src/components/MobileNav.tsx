"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/Sidebar";
import { Logo } from "@/components/Logo";

const DARK = "#163134";

/**
 * Barra superior + drawer de navegação para telas pequenas (md-).
 * No desktop fica oculta (a Sidebar fixa assume).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="md:hidden flex items-center gap-3 px-3 py-2 border-b"
      style={{ backgroundColor: DARK, borderColor: "rgba(255,255,255,0.08)" }}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              aria-label="Abrir menu de navegação"
              className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
            />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 border-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <Sidebar mobile onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Logo height={22} />
    </div>
  );
}
