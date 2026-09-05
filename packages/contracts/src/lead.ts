import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * Lead: alguém que procurou a empresa e ainda não é cliente.
 *
 * **Não é `Oportunidade`.** Aquela exige cliente e vendedor — é o funil de quem
 * já é cliente e já tem dono. O lead é anterior aos dois, e vive numa tabela
 * própria até alguém decidir o que fazer com ele.
 *
 * Quem capta é a IA do número institucional; quem distribui é a supervisão.
 */

export const leadSituacaoSchema = z.enum([
  "novo",
  "em_atendimento",
  "convertido",
  "descartado",
]);
export type LeadSituacao = z.infer<typeof leadSituacaoSchema>;

export const LEAD_SITUACAO_LABEL: Record<LeadSituacao, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  convertido: "Convertido",
  descartado: "Descartado",
};

export const leadTemperaturaSchema = z.enum(["quente", "morno", "frio"]);
export type LeadTemperatura = z.infer<typeof leadTemperaturaSchema>;

export const LEAD_TEMPERATURA_LABEL: Record<LeadTemperatura, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

export const leadSchema = z.object({
  id: z.string().uuid(),
  /**
   * Nome, empresa e documento são **o que a pessoa disse** na conversa — nada
   * aqui é verificado contra cadastro nenhum.
   */
  nome: z.string().nullable(),
  empresaInformada: z.string().nullable(),
  documento: z.string().nullable(),
  /** De onde veio. O único dado que não depende do que ela diz. */
  telefone: z.string(),
  interesse: z.string(),
  temperatura: leadTemperaturaSchema,
  /** Por que a IA classificou assim — para quem recebe poder discordar. */
  motivoClassificacao: z.string().nullable(),
  situacao: leadSituacaoSchema,
  vendedorId: z.string().uuid().nullable(),
  vendedorNome: z.string().nullable(),
  assumidoEm: z.string().datetime().nullable(),
  /** Conversa de WhatsApp que o originou, para abrir o histórico. */
  conversaId: z.string().uuid().nullable(),
  observacao: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadQuerySchema = paginationQuerySchema.extend({
  situacao: leadSituacaoSchema.optional(),
  temperatura: leadTemperaturaSchema.optional(),
});
export type LeadQuery = z.infer<typeof leadQuerySchema>;

export const leadAtualizarSchema = z.object({
  situacao: leadSituacaoSchema.optional(),
  /**
   * Vendedor a quem entregar. `null` devolve o lead à fila da supervisão —
   * é como se corrige um direcionamento errado sem perder o registro.
   */
  vendedorId: z.string().uuid().nullable().optional(),
  observacao: z.string().trim().max(2000).nullable().optional(),
});
export type LeadAtualizar = z.infer<typeof leadAtualizarSchema>;

export const LEAD_EXAMPLE: Lead = {
  id: "5d2a1f7c-9b3e-4a81-8c02-1e4f5a6b7c8d",
  nome: "Marcos",
  empresaInformada: "Padaria Estrela",
  documento: null,
  telefone: "5567999887766",
  interesse: "Quer preço de refrigerante em caixa para revenda",
  temperatura: "quente",
  motivoClassificacao: "Disse que quer fechar esta semana e citou volume.",
  situacao: "novo",
  vendedorId: null,
  vendedorNome: null,
  assumidoEm: null,
  conversaId: "9b8c7d6e-5f40-4312-a1b2-c3d4e5f60718",
  observacao: null,
  createdAt: "2026-09-05T13:20:00.000Z",
};
