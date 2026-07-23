import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const vendedorCreateSchema = z.object({
  codigoErp: opt(30),
  nome: z.string().trim().min(1, "Informe o nome").max(100),
  nomeReduzido: opt(50),
  telefone: opt(15),
  email: z.string().trim().max(100).email("E-mail inválido").optional().or(z.literal("")),
  dataNascimento: z.coerce.date().nullable().optional(),
  usuarioId: z.string().uuid().nullable().optional(),
  vendedor: z.boolean().default(true),
  supervisorId: z.string().uuid().nullable().optional(),
  supervisor: z.boolean().default(false),
  gerenteId: z.string().uuid().nullable().optional(),
  gerente: z.boolean().default(false),
  ativo: z.boolean().default(true),
  desligado: z.boolean().default(false),
});
export type VendedorCreate = z.infer<typeof vendedorCreateSchema>;

export const vendedorUpdateSchema = vendedorCreateSchema.partial();
export type VendedorUpdate = z.infer<typeof vendedorUpdateSchema>;

export const vendedorSchema = vendedorCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Vendedor = z.infer<typeof vendedorSchema>;

// Filtros de listagem, além de busca/paginação/ordenação (paginationQuerySchema).
export const vendedorQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  vendedor: booleanQueryParam,
  supervisor: booleanQueryParam,
  gerente: booleanQueryParam,
  desligado: booleanQueryParam,
  supervisorId: z.string().uuid().optional(),
});
export type VendedorQuery = z.infer<typeof vendedorQuerySchema>;

export const VENDEDOR_CREATE_EXAMPLE: VendedorCreate = {
  codigoErp: "000234",
  nome: "FABIANO OLIVEIRA",
  nomeReduzido: "FABIANO",
  telefone: "(67) 3354-9465",
  email: "",
  dataNascimento: null,
  usuarioId: null,
  vendedor: true,
  supervisorId: null,
  supervisor: false,
  gerenteId: null,
  gerente: false,
  ativo: true,
  desligado: false,
};
