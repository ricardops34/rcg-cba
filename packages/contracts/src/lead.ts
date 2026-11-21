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

/**
 * De onde o lead veio: a IA do WhatsApp, a coleta na base da Receita
 * (prospecção) ou cadastro manual.
 */
export const leadOrigemSchema = z.enum(["whatsapp", "receita", "manual"]);
export type LeadOrigem = z.infer<typeof leadOrigemSchema>;

export const LEAD_ORIGEM_LABEL: Record<LeadOrigem, string> = {
  whatsapp: "WhatsApp",
  receita: "Receita",
  manual: "Manual",
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
  origem: leadOrigemSchema,
  /**
   * WhatsApp: de onde veio, o único dado que não depende do que a pessoa diz.
   * Receita: o primeiro telefone da empresa, quando há.
   */
  telefone: z.string().nullable(),
  /** O que procura (IA). Vazio no lead da Receita. */
  interesse: z.string().nullable(),
  /** Dados da empresa, vindos da Receita. `cnpj` só com dígitos. */
  cnpj: z.string().nullable(),
  razaoSocial: z.string().nullable(),
  nomeFantasia: z.string().nullable(),
  situacaoCadastral: z.string().nullable(),
  dataAbertura: z.string().nullable(),
  naturezaJuridica: z.string().nullable(),
  porte: z.string().nullable(),
  capitalSocial: z.number().nullable(),
  email: z.string().nullable(),
  telefone2: z.string().nullable(),
  /** CNAE principal (código e descrição), quando veio da Receita. */
  cnaePrincipal: z.object({ codigo: z.string(), descricao: z.string().nullable() }).nullable(),
  coletadoEm: z.string().datetime().nullable(),
  /** Cliente com o mesmo CNPJ, depois da conversão. */
  clienteId: z.string().uuid().nullable(),
  convertidoEm: z.string().datetime().nullable(),
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
  /** Endereço informado por quem atende; as coordenadas vêm do Google. */
  endereco: z.string().nullable(),
  bairro: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  createdAt: z.string().datetime(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadQuerySchema = paginationQuerySchema.extend({
  situacao: leadSituacaoSchema.optional(),
  temperatura: leadTemperaturaSchema.optional(),
  origem: leadOrigemSchema.optional(),
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
  endereco: z.string().trim().max(200).nullable().optional(),
  bairro: z.string().trim().max(100).nullable().optional(),
  municipio: z.string().trim().max(100).nullable().optional(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF com 2 letras")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  cep: z.string().trim().max(9).nullable().optional(),
  /**
   * Digitadas na tela valem; vazias, o Google preenche ao salvar o endereço
   * (com a geolocalização habilitada).
   */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
export type LeadAtualizar = z.infer<typeof leadAtualizarSchema>;

export const LEAD_EXAMPLE: Lead = {
  id: "5d2a1f7c-9b3e-4a81-8c02-1e4f5a6b7c8d",
  nome: "Marcos",
  empresaInformada: "Padaria Estrela",
  documento: null,
  origem: "whatsapp",
  telefone: "5567999887766",
  interesse: "Quer preço de refrigerante em caixa para revenda",
  cnpj: null,
  razaoSocial: null,
  nomeFantasia: null,
  situacaoCadastral: null,
  dataAbertura: null,
  naturezaJuridica: null,
  porte: null,
  capitalSocial: null,
  email: null,
  telefone2: null,
  cnaePrincipal: null,
  coletadoEm: null,
  clienteId: null,
  convertidoEm: null,
  temperatura: "quente",
  motivoClassificacao: "Disse que quer fechar esta semana e citou volume.",
  situacao: "novo",
  vendedorId: null,
  vendedorNome: null,
  assumidoEm: null,
  conversaId: "9b8c7d6e-5f40-4312-a1b2-c3d4e5f60718",
  observacao: null,
  endereco: null,
  bairro: null,
  municipio: "CAMPO GRANDE",
  uf: "MS",
  cep: null,
  latitude: null,
  longitude: null,
  createdAt: "2026-09-05T13:20:00.000Z",
};
