import { z } from "zod";

export const acaoSchema = z
  .enum([
    "visualizar",
    "cadastrar",
    "editar",
    "excluir",
    "importar",
    "exportar",
    "aprovar",
    "cancelar",
    "bloquear",
  ])
  .describe("Operação controlada pelo RBAC dentro de uma rotina");
export type Acao = z.infer<typeof acaoSchema>;

/**
 * Boolean vindo de query string ("true"/"false"). NÃO usar z.coerce.boolean()
 * pra isso — Boolean("false") é true em JS (string não-vazia é truthy),
 * então ?ativo=false seria coagido pra true. Aceita string ou boolean (já
 * que query params sempre chegam como string, mas o schema também é usado
 * fora de query em alguns lugares).
 */
export const booleanQueryParam = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true")
  .optional();

export const auditFieldsSchema = z.object({
  createdAt: z.string().datetime().describe("Data/hora de criação do registro (ISO 8601)"),
  updatedAt: z.string().datetime().describe("Data/hora da última alteração (ISO 8601)"),
  createdBy: z.string().uuid().nullable().describe("Usuário que criou o registro, ou null se criado pelo seed/sistema"),
  updatedBy: z.string().uuid().nullable().describe("Usuário que fez a última alteração"),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe("Página atual, começando em 1"),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).describe("Itens por página (máx. 100)"),
  search: z.string().trim().optional().describe("Busca textual livre, aplicada aos campos relevantes da entidade"),
  sortBy: z.string().optional().describe("Nome do campo para ordenação"),
  sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Direção da ordenação"),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Tamanhos de página que o seletor das listagens oferece e que perfil e
 * usuário podem gravar como padrão. O maior não passa do máximo de
 * `paginationQuerySchema.pageSize`.
 */
export const TAMANHOS_PAGINA = [10, 20, 50, 100] as const;
export type TamanhoPagina = (typeof TAMANHOS_PAGINA)[number];
export const tamanhoPaginaSchema = z
  .number()
  .int()
  .refine((n): n is TamanhoPagina => (TAMANHOS_PAGINA as readonly number[]).includes(n), {
    message: `Tamanho de página deve ser ${TAMANHOS_PAGINA.join(", ")}`,
  });

export const PAGINATION_QUERY_EXAMPLE: PaginationQuery = {
  page: 1,
  pageSize: 20,
  search: "andrade",
  sortBy: "razaoSocial",
  sortOrder: "asc",
};

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item).describe("Itens da página atual"),
    total: z.number().int().describe("Total de registros que atendem ao filtro"),
    page: z.number().int().describe("Página atual"),
    pageSize: z.number().int().describe("Itens por página"),
    totalPages: z.number().int().describe("Total de páginas disponíveis"),
  });
}
