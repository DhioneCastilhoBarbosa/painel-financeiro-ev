import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AccentColor = "blue" | "emerald" | "amber" | "red" | "violet" | "cyan";

interface KPICardProps {
  title: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tooltip?: string;
  trend?: number;
  loading?: boolean;
  className?: string;
  accent?: AccentColor;
}

const accentStyles: Record<AccentColor, string> = {
  blue:    "border-l-4 border-l-blue-500",
  emerald: "border-l-4 border-l-emerald-500",
  amber:   "border-l-4 border-l-amber-500",
  red:     "border-l-4 border-l-red-500",
  violet:  "border-l-4 border-l-violet-500",
  cyan:    "border-l-4 border-l-cyan-500",
};

const accentIconStyles: Record<AccentColor, string> = {
  blue:    "text-blue-500",
  emerald: "text-emerald-500",
  amber:   "text-amber-500",
  red:     "text-red-500",
  violet:  "text-violet-500",
  cyan:    "text-cyan-500",
};

export function KPICard({ title, value, sub, icon, tooltip, trend, loading, className, accent }: KPICardProps) {
  if (loading) {
    return (
      <Card className={cn(accent && accentStyles[accent], className)}>
        <CardContent className="pt-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("hover:shadow-md transition-shadow", accent && accentStyles[accent], className)}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            {tooltip && (
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors" tabIndex={-1} />
                    }
                  >
                    <Info className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-center leading-snug">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {icon && (
            <div className={accent ? accentIconStyles[accent] : "text-muted-foreground"}>
              {icon}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
        {(sub || trend !== undefined) && (
          <div className="flex items-center gap-1 mt-1">
            {trend !== undefined && (
              <span className={cn("text-xs font-medium", trend >= 0 ? "text-emerald-600" : "text-red-500")}>
                {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
              </span>
            )}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
