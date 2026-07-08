import { cn } from "@/lib/utils";

export function StatusDot({ active, labelOn = "Ativo", labelOff = "Inativo" }: { active: boolean; labelOn?: string; labelOff?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-success" : "bg-muted-foreground/40")}
      />
      {active ? labelOn : labelOff}
    </span>
  );
}
