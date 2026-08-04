import type { StatusOrcamento } from "@plataforma/contracts";

export const STATUS_ORCAMENTO: { value: StatusOrcamento; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "enviado", label: "Enviado" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
  { value: "expirado", label: "Expirado" },
];

export const STATUS_ORCAMENTO_LABEL = Object.fromEntries(
  STATUS_ORCAMENTO.map((s) => [s.value, s.label]),
) as Record<StatusOrcamento, string>;

export const STATUS_ORCAMENTO_VARIANT: Record<StatusOrcamento, "default" | "outline" | "destructive"> = {
  rascunho: "outline",
  enviado: "outline",
  aprovado: "default",
  recusado: "destructive",
  expirado: "outline",
};

/** Cor usada nos chips da Agenda — mesmo critério de TIPO_COR (atividade-tipo.ts). */
export const STATUS_ORCAMENTO_COR: Record<StatusOrcamento, string> = {
  rascunho: "bg-slate-400",
  enviado: "bg-blue-500",
  aprovado: "bg-emerald-500",
  recusado: "bg-red-500",
  expirado: "bg-amber-500",
};
