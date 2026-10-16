import type { Atividade, Orcamento, TipoAtividade } from "@plataforma/contracts";

/**
 * O que a Agenda mostra são **eventos**, de natureza diferente: orçamentos,
 * retornos de orçamento, atendimentos e mensagens agendados pelo WhatsApp,
 * reuniões, visitas, ligações… O filtro da Agenda é por essa natureza, e não só
 * pelo tipo da atividade — "atendimento por WhatsApp" é uma atividade comum no
 * banco, mas é outra coisa para quem olha a agenda.
 */
export type CategoriaEvento =
  | "orcamento"
  | "retorno_orcamento"
  | "atendimento_whatsapp"
  | "mensagem_whatsapp"
  | TipoAtividade;

export const CATEGORIAS_EVENTO: { value: CategoriaEvento; label: string }[] = [
  { value: "orcamento", label: "Orçamentos" },
  { value: "retorno_orcamento", label: "Retornos de orçamento" },
  { value: "atendimento_whatsapp", label: "Atendimentos por WhatsApp" },
  { value: "mensagem_whatsapp", label: "Mensagens agendadas (WhatsApp)" },
  { value: "reuniao", label: "Reuniões" },
  { value: "visita", label: "Visitas" },
  { value: "ligacao", label: "Ligações" },
  { value: "email", label: "E-mails" },
  { value: "tarefa", label: "Tarefas" },
];

export const ROTULO_EVENTO = Object.fromEntries(
  CATEGORIAS_EVENTO.map((c) => [c.value, c.label]),
) as Record<CategoriaEvento, string>;

/** Rótulo curto, no singular, para a linha do evento. */
export const ROTULO_EVENTO_UNITARIO: Record<CategoriaEvento, string> = {
  orcamento: "Orçamento",
  retorno_orcamento: "Retorno de orçamento",
  atendimento_whatsapp: "Atendimento por WhatsApp",
  mensagem_whatsapp: "Mensagem agendada",
  reuniao: "Reunião",
  visita: "Visita",
  ligacao: "Ligação",
  email: "E-mail",
  tarefa: "Tarefa",
};

export type EventoDaAgenda =
  | { kind: "atividade"; data: Atividade }
  | { kind: "orcamento"; data: Orcamento };

/** A natureza do evento, na ordem de especificidade. */
export function categoriaDoEvento(item: EventoDaAgenda): CategoriaEvento {
  if (item.kind === "orcamento") return "orcamento";
  const a = item.data;
  if (a.automatica) return "mensagem_whatsapp";
  if (a.iniciarConversa) return "atendimento_whatsapp";
  if (a.orcamentoId && a.titulo.startsWith("Retorno:")) return "retorno_orcamento";
  return a.tipo;
}
