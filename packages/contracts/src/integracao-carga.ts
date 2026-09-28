import { z } from "zod";
import { paginatedResponseSchema } from "./common";

// ------------------------------------------------------------------
// Carga por arquivo (POST /integracao/cargas)
// Ver docs/planos/2026-09-28-carga-por-arquivo.md.
// ------------------------------------------------------------------

/**
 * Teto do arquivo recebido, em bytes. É o tamanho do que o ERP manda —
 * compactado, quando vem compactado. A base medida (119 mil registros) cabe
 * com folga; uma entidade que passe disso é dividida em mais de um arquivo.
 */
export const INTEGRACAO_CARGA_MAX_BYTES = 100 * 1024 * 1024;

/**
 * As entidades que um arquivo pode trazer: as que têm `PUT` em bloco, com o
 * nome da rota (`/integracao/<entidade>`). O XML da nota fica de fora — a rota
 * dele é por chave, não em bloco.
 */
export const INTEGRACAO_CARGA_ENTIDADES = [
  "regras-desconto",
  "categorias",
  "condicoes-pagamento",
  "armazens",
  "vendedores",
  "fornecedores",
  "produtos",
  "estoque",
  "tabelas-preco",
  "clientes",
  "titulos-receber",
  "objetivos",
  "notas-saida",
  "notas-entrada",
  "orcamentos",
] as const;
export type IntegracaoCargaEntidade = (typeof INTEGRACAO_CARGA_ENTIDADES)[number];

/**
 * `aguardando`: subida pela tela, esperando alguém mandar processar.
 * `recebida`: na fila do processamento — é como entra a que o ERP manda pela
 * chave de API, e como fica a da tela depois de liberada.
 */
export const integracaoCargaSituacaoSchema = z.enum([
  "aguardando",
  "recebida",
  "processando",
  "concluida",
  "cancelada",
  "erro",
]);
export type IntegracaoCargaSituacao = z.infer<typeof integracaoCargaSituacaoSchema>;

export const integracaoCargaSchema = z.object({
  id: z.string().uuid(),
  descricao: z.string().nullable(),
  situacao: integracaoCargaSituacaoSchema,
  tamanho: z.number().int().describe("Bytes recebidos"),
  entidades: z.record(z.number().int()).describe("Linhas por entidade no arquivo"),
  totalLinhas: z.number().int(),
  linhasProcessadas: z.number().int(),
  criados: z.number().int(),
  atualizados: z.number().int(),
  excluidos: z.number().int(),
  erros: z.number().int().describe("Registros recusados — detalhe em /erros"),
  mensagem: z.string().nullable().describe("Motivo quando a carga inteira parou"),
  createdAt: z.string().datetime(),
  iniciadaEm: z.string().datetime().nullable(),
  concluidaEm: z.string().datetime().nullable(),
  atualizadaEm: z.string().datetime().describe("Último avanço do processamento"),
});
export type IntegracaoCarga = z.infer<typeof integracaoCargaSchema>;

export const integracaoCargaErroSchema = z.object({
  linha: z.number().int().describe("Linha do arquivo, começando em 1"),
  entidade: z.string(),
  chave: z.string().nullable(),
  mensagem: z.string(),
});
export type IntegracaoCargaErro = z.infer<typeof integracaoCargaErroSchema>;

/** Libera para processar as cargas que aguardam. Sem `ids`, todas. */
export const integracaoCargaProcessarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
});
export type IntegracaoCargaProcessar = z.infer<typeof integracaoCargaProcessarSchema>;

export const integracaoCargaErrosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
});
export type IntegracaoCargaErrosQuery = z.infer<typeof integracaoCargaErrosQuerySchema>;

export const integracaoCargaErrosPageSchema = paginatedResponseSchema(integracaoCargaErroSchema);
export type IntegracaoCargaErrosPage = z.infer<typeof integracaoCargaErrosPageSchema>;

export const INTEGRACAO_CARGA_EXAMPLE: IntegracaoCarga = {
  id: "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  descricao: "Carga inicial - titulos-receber",
  situacao: "processando",
  tamanho: 6_815_744,
  entidades: { "titulos-receber": 104294 },
  totalLinhas: 104294,
  linhasProcessadas: 37000,
  criados: 36950,
  atualizados: 0,
  excluidos: 0,
  erros: 50,
  mensagem: null,
  createdAt: "2026-09-28T13:00:00.000Z",
  iniciadaEm: "2026-09-28T13:00:05.000Z",
  concluidaEm: null,
  atualizadaEm: "2026-09-28T13:04:22.000Z",
};
