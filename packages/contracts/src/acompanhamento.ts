import { z } from "zod";

/**
 * Acompanhamento da equipe (docs/planos/2026-10-27-acompanhamento-equipe.md):
 * uma linha por vendedor, por assunto. Só números — quem lê é o Supervisor, o
 * Gerente ou o Diretor, dentro do escopo da hierarquia dele.
 */
export const acompanhamentoQuerySchema = z.object({
  /** Janela, em dias, até hoje. Fora dela, o assunto usa a janela própria (dita na resposta). */
  dias: z.coerce.number().int().min(7).max(365).default(30),
});
export type AcompanhamentoQuery = z.infer<typeof acompanhamentoQuerySchema>;

export const ACOMPANHAMENTO_ABAS = [
  "atendimento",
  "nao-vinculados",
  "carteira",
  "cadastro",
  "mix",
  "descontos",
  "orcamentos",
  "comodato",
] as const;
export type AcompanhamentoAba = (typeof ACOMPANHAMENTO_ABAS)[number];

/** Toda linha é de um vendedor; os números variam por aba. */
export interface AcompanhamentoLinha {
  vendedorId: string | null;
  vendedor: string;
  [campo: string]: string | number | null;
}

export interface AcompanhamentoResposta {
  periodoDias: number;
  /** Aviso de como o número é calculado, mostrado sob a tabela. */
  nota?: string;
  linhas: AcompanhamentoLinha[];
  total: Record<string, number | null>;
  /** Detalhe opcional (ex.: contatos sem vínculo, clientes de comodato sem compra). */
  detalhe?: Record<string, string | number | null>[];
}
