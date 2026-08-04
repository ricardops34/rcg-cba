import type { TipoAtividade } from "@plataforma/contracts";

export const TIPOS: { value: TipoAtividade; label: string }[] = [
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "email", label: "E-mail" },
  { value: "visita", label: "Visita" },
  { value: "tarefa", label: "Tarefa" },
];

export const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<
  TipoAtividade,
  string
>;

/** Cores usadas nos chips da Agenda — mantidas fora do Badge (que só tem poucas variantes). */
export const TIPO_COR: Record<TipoAtividade, string> = {
  ligacao: "bg-blue-500",
  reuniao: "bg-violet-500",
  email: "bg-amber-500",
  visita: "bg-emerald-500",
  tarefa: "bg-slate-500",
};
