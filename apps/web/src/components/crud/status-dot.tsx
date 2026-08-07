import { cn } from "@/lib/utils";

export function StatusDot({
  active,
  labelOn = "Ativo",
  labelOff = "Inativo",
  showLabel = true,
  offColor = "muted",
}: {
  active: boolean;
  labelOn?: string;
  labelOff?: string;
  /** false = mostra só a bolinha, sem o texto Ativo/Inativo (usa title p/ acessibilidade). */
  showLabel?: boolean;
  /** Cor da bolinha quando inativo — "danger" usa vermelho em vez do cinza padrão. */
  offColor?: "muted" | "danger";
}) {
  const label = active ? labelOn : labelOff;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm"
      title={showLabel ? undefined : label}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active ? "bg-success" : offColor === "danger" ? "bg-destructive" : "bg-muted-foreground/40",
        )}
      />
      {showLabel && label}
    </span>
  );
}
