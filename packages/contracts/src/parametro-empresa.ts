import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

/**
 * Parâmetros do sistema por empresa (Administração > Parâmetros), no formato
 * clássico de tabela de parâmetros de ERP: uma linha por parâmetro, com tipo,
 * tamanho, conteúdo e descrição.
 *
 * `conteudo` é sempre texto — `tipo` diz como interpretá-lo. Quem lê no
 * backend usa ParametrosService, que converte e valida; a tela usa o tipo
 * para escolher o campo de edição (número, sim/não, senha…).
 *
 * Sem API de integração: parâmetro é configuração interna, mantida só pela
 * tela.
 */

export const tipoParametroSchema = z.enum([
  "texto",
  "numero",
  "booleano",
  "data",
  "senha",
]);
export type TipoParametro = z.infer<typeof tipoParametroSchema>;

export const TIPO_PARAMETRO_LABEL: Record<TipoParametro, string> = {
  texto: "Texto",
  numero: "Número",
  booleano: "Sim/Não",
  data: "Data",
  senha: "Senha",
};

export const parametroEmpresaCreateSchema = z.object({
  // Nome em caixa alta com _ , como as chaves herdadas do ERP.
  parametro: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "Use apenas letras maiúsculas, números e _")
    .describe("Chave do parâmetro (ex.: ORCAMENTO_DIAS_VALIDADE)"),
  tipo: tipoParametroSchema.default("texto"),
  tamanho: z.coerce.number().int().min(1).max(4000).nullable().optional(),
  conteudo: z.string().max(4000).nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  ativo: z.boolean().default(true),
});
export type ParametroEmpresaCreate = z.infer<typeof parametroEmpresaCreateSchema>;

export const parametroEmpresaUpdateSchema = parametroEmpresaCreateSchema.partial();
export type ParametroEmpresaUpdate = z.infer<typeof parametroEmpresaUpdateSchema>;

export const parametroEmpresaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  parametro: z.string(),
  tipo: tipoParametroSchema,
  tamanho: z.number().int().nullable(),
  // Parâmetro de tipo "senha" nunca devolve o conteúdo — só se está preenchido.
  conteudo: z.string().nullable(),
  preenchido: z.boolean().describe("Para tipo senha: indica que há valor gravado"),
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type ParametroEmpresa = z.infer<typeof parametroEmpresaSchema>;

export const parametroEmpresaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  tipo: tipoParametroSchema.optional(),
});
export type ParametroEmpresaQuery = z.infer<typeof parametroEmpresaQuerySchema>;

export const PARAMETRO_EMPRESA_CREATE_EXAMPLE: ParametroEmpresaCreate = {
  parametro: "ORCAMENTO_DIAS_VALIDADE",
  tipo: "numero",
  tamanho: 3,
  conteudo: "30",
  descricao: "Dias somados à emissão para sugerir a validade do orçamento",
  ativo: true,
};

export const PARAMETRO_EMPRESA_EXAMPLE: ParametroEmpresa = {
  id: "4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  parametro: "ORCAMENTO_DIAS_VALIDADE",
  tipo: "numero",
  tamanho: 3,
  conteudo: "30",
  preenchido: true,
  descricao: "Dias somados à emissão para sugerir a validade do orçamento",
  ativo: true,
  createdAt: "2026-08-10T12:00:00.000Z",
  updatedAt: "2026-08-10T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};
