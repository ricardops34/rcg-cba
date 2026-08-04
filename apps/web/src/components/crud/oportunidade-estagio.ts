import type { EstagioOportunidade } from "@plataforma/contracts";

export const ESTAGIOS: { value: EstagioOportunidade; label: string }[] = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "proposta", label: "Proposta" },
  { value: "negociacao", label: "Negociação" },
  { value: "ganha", label: "Ganha" },
  { value: "perdida", label: "Perdida" },
];

export const ESTAGIO_LABEL = Object.fromEntries(ESTAGIOS.map((e) => [e.value, e.label])) as Record<
  EstagioOportunidade,
  string
>;

export const ESTAGIO_VARIANT: Record<EstagioOportunidade, "default" | "outline" | "destructive"> = {
  prospeccao: "outline",
  qualificacao: "outline",
  proposta: "outline",
  negociacao: "outline",
  ganha: "default",
  perdida: "destructive",
};
