import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiTone = "default" | "primary" | "special" | "warning" | "success";

const toneClasses: Record<KpiTone, { icon: string; bg: string }> = {
  default: { icon: "text-muted-foreground", bg: "bg-muted" },
  primary: { icon: "text-primary", bg: "bg-primary/10" },
  special: {
    icon: "text-[hsl(var(--special))]",
    bg: "bg-[hsl(var(--special))/.10]",
  },
  warning: {
    icon: "text-[hsl(var(--warning))]",
    bg: "bg-[hsl(var(--warning))/.10]",
  },
  success: {
    icon: "text-[hsl(var(--success))]",
    bg: "bg-[hsl(var(--success))/.10]",
  },
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
}) {
  const tones = toneClasses[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            tones.bg,
          )}
        >
          <Icon className={cn("h-5 w-5", tones.icon)} aria-hidden />
        </div>
      </div>
    </Card>
  );
}
