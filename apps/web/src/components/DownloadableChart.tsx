"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import { downloadChartAsPNG } from "@/lib/downloadChart";

interface Props {
  filename?: string;
  children: React.ReactNode;
  className?: string;
}

export function DownloadableChart({ filename = "grafico", children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={`relative group ${className ?? ""}`}>
      {children}
      <button
        onClick={() => ref.current && downloadChartAsPNG(ref.current, filename)}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-1 shadow-sm"
        title="Baixar gráfico — PNG 300 DPI"
        type="button"
      >
        <Download className="h-3 w-3 text-slate-600 dark:text-slate-300" />
      </button>
    </div>
  );
}
