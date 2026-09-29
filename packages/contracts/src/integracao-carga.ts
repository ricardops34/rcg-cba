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
  "pedidos",
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
  tentativas: z.number().int().describe("Vezes que o processamento pegou a carga (normal: 1)"),
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

/**
 * Lista da tela (aba Processamento): paginada, filtrável por situação, com o
 * resumo por situação de TODAS as cargas da empresa e a que está rodando agora
 * — a página mostra só um pedaço, e a fila anda das mais antigas para as mais
 * novas.
 */
/**
 * Grupos da tela: **nao-processados** (aguardando e na fila),
 * **em-processamento**, **processados** (concluída sem nenhum registro
 * recusado), **com-erro** (parou com erro, ou concluiu com recusados) e
 * **canceladas**.
 */
export const integracaoCargaGrupoSchema = z.enum([
  "nao-processados",
  "em-processamento",
  "processados",
  "com-erro",
  "canceladas",
]);
export type IntegracaoCargaGrupo = z.infer<typeof integracaoCargaGrupoSchema>;

export const integracaoCargaListaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  situacao: integracaoCargaSituacaoSchema.optional(),
  grupo: integracaoCargaGrupoSchema.optional(),
});
export type IntegracaoCargaListaQuery = z.infer<typeof integracaoCargaListaQuerySchema>;

export const integracaoCargaListaSchema = paginatedResponseSchema(integracaoCargaSchema).extend({
  resumo: z
    .object({
      aguardando: z.number().int(),
      recebida: z.number().int(),
      processando: z.number().int(),
      concluida: z.number().int(),
      cancelada: z.number().int(),
      erro: z.number().int(),
    })
    .describe("Cargas por situação, na empresa toda"),
  grupos: z
    .object({
      "nao-processados": z.number().int(),
      "em-processamento": z.number().int(),
      processados: z.number().int(),
      "com-erro": z.number().int(),
      canceladas: z.number().int(),
    })
    .describe("Cargas por grupo da tela, na empresa toda"),
  emProcessamento: integracaoCargaSchema.nullable().describe("A carga que está rodando agora"),
});
export type IntegracaoCargaLista = z.infer<typeof integracaoCargaListaSchema>;

/** Libera para processar as cargas que aguardam. Sem `ids`, todas. */
export const integracaoCargaProcessarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
});
export type IntegracaoCargaProcessar = z.infer<typeof integracaoCargaProcessarSchema>;

/**
 * Reprocessar: a carga volta para a fila e roda o arquivo inteiro de novo
 * (a gravação é por chave, não duplica). Sem `ids`, todas as do grupo
 * **com-erro**.
 */
export const integracaoCargaReprocessarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
});
export type IntegracaoCargaReprocessar = z.infer<typeof integracaoCargaReprocessarSchema>;

/**
 * Limpar: exclui as cargas do grupo (registro e arquivo guardado; os dados já
 * gravados na plataforma ficam). Nunca as que estão na fila ou rodando.
 */
export const integracaoCargaLimparSchema = z.object({
  grupo: z.enum(["processados", "com-erro", "canceladas", "nao-processados"]),
});
export type IntegracaoCargaLimpar = z.infer<typeof integracaoCargaLimparSchema>;

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
  tentativas: 1,
  createdAt: "2026-09-28T13:00:00.000Z",
  iniciadaEm: "2026-09-28T13:00:05.000Z",
  concluidaEm: null,
  atualizadaEm: "2026-09-28T13:04:22.000Z",
};
