"use client";

import { Slider } from "@/components/ui/slider";

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

interface TimeRangeSliderProps {
  startMin: number;
  endMin: number;
  onChange: (start: number, end: number) => void;
  /** Minimum gap between handles in minutes (default 30) */
  minGap?: number;
  className?: string;
  labelClassName?: string;
}

export function TimeRangeSlider({
  startMin,
  endMin,
  onChange,
  minGap = 30,
  className,
  labelClassName,
}: TimeRangeSliderProps) {
  const effectiveHours = (endMin - startMin) / 60;

  return (
    <div className={className}>
      <div className={`flex items-center gap-2 text-sm font-semibold mb-3 ${labelClassName ?? ""}`}>
        <span>{fmtTime(startMin)}</span>
        <span className="text-muted-foreground font-normal">→</span>
        <span>{fmtTime(endMin)}</span>
        <span className="text-muted-foreground font-normal text-xs">
          ({effectiveHours.toFixed(1)}h/dia)
        </span>
      </div>

      <div className="relative px-2">
        {/* Time labels */}
        <div className="flex justify-between text-[0.62rem] text-muted-foreground mb-1">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>

        <Slider
          min={0}
          max={1440}
          step={30}
          value={[startMin, endMin]}
          onValueChange={([s, e]) => {
            if (e - s >= minGap) onChange(s, e);
          }}
        />
      </div>
    </div>
  );
}
