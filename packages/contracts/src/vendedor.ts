import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/**
 * Papel do vendedor na hierarquia comercial — um só por cadastro (antes eram
 * três booleanos independentes, que aceitavam combinações sem sentido).
 * Define o alcance no escopo: gerente vê o time todo, supervisor vê os
 * vendedores abaixo dele, vendedor vê a própria carteira.
 */
export const tipoVendedorSchema = z.enum(["vendedor", "supervisor", "gerente"]);
export type TipoVendedor = z.infer<typeof tipoVendedorSchema>;

export const TIPO_VENDEDOR_LABEL: Record<TipoVendedor, string> = {
  vendedor: "Vendedor",
  supervisor: "Supervisor",
  gerente: "Gerente",
};

/**
 * Como o vendedor se liga à empresa. `sistema` são os cadastros que não são
 * pessoas de venda (ESCRITORIO, E-COMMERCE, balcão), mantidos porque o ERP
 * credita nota a eles.
 */
export const vinculoVendedorSchema = z.enum(["clt", "representante", "sistema"]);
export type VinculoVendedor = z.infer<typeof vinculoVendedorSchema>;

export const VINCULO_VENDEDOR_LABEL: Record<VinculoVendedor, string> = {
  clt: "CLT",
  representante: "Representante",
  sistema: "Sistema",
};

export const vendedorCreateSchema = z.object({
  codigoErp: opt(30),
  nome: z.string().trim().min(1, "Informe o nome").max(100),
  nomeReduzido: opt(50),
  telefone: opt(15),
  email: z.string().trim().max(100).email("E-mail inválido").optional().or(z.literal("")),
  dataNascimento: z.coerce.date().nullable().optional(),
  usuarioId: z.string().uuid().nullable().optional(),
  tipo: tipoVendedorSchema.default("vendedor"),
  vinculo: vinculoVendedorSchema.nullable().optional(),
  /** Aparece nas telas gerenciais (dashboard, objetivos). */
  usaDashboard: z.boolean().default(true),
  supervisorId: z.string().uuid().nullable().optional(),
  gerenteId: z.string().uuid().nullable().optional(),
  // `desligado` é o controle de saída do vendedor e o que a tela mostra; o
  // servidor mantém `ativo` como espelho dele (desligado = não ativo), porque
  // `ativo` é o que os selects e filtros do sistema consultam.
  ativo: z.boolean().default(true),
  desligado: z.boolean().default(false),
});
export type VendedorCreate = z.infer<typeof vendedorCreateSchema>;

export const vendedorUpdateSchema = vendedorCreateSchema.partial();
export type VendedorUpdate = z.infer<typeof vendedorUpdateSchema>;

export const vendedorSchema = vendedorCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  // Tamanho da carteira, calculado na listagem: quantos clientes o vendedor
  // tem hoje, separando os ativos dos inativos. Ausente em respostas que não
  // são de listagem.
  clientesAtivos: z.number().int().optional(),
  clientesInativos: z.number().int().optional(),
  // Comissão do vendedor: leitura apenas — quem mantém é o ERP, pela API de
  // integração. Fora do create/update de propósito, como os campos de regra
  // de desconto.
  percComissao: z.number().nullable().optional(),
  ...auditFieldsSchema.shape,
});
export type Vendedor = z.infer<typeof vendedorSchema>;

// Filtros de listagem, além de busca/paginação/ordenação (paginationQuerySchema).
export const vendedorQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  tipo: tipoVendedorSchema.optional(),
  vinculo: vinculoVendedorSchema.optional(),
  usaDashboard: booleanQueryParam,
  desligado: booleanQueryParam,
  supervisorId: z.string().uuid().optional(),
});
export type VendedorQuery = z.infer<typeof vendedorQuerySchema>;

export const VENDEDOR_EXAMPLE: Vendedor = {
  id: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "000234",
  nome: "FABIANO OLIVEIRA",
  nomeReduzido: "FABIANO",
  telefone: "(67) 3354-9465",
  email: "fabiano@rcg.com.br",
  dataNascimento: null,
  usuarioId: null,
  tipo: "vendedor",
  vinculo: "clt",
  usaDashboard: true,
  supervisorId: null,
  gerenteId: null,
  ativo: true,
  desligado: false,
  clientesAtivos: 128,
  clientesInativos: 14,
  percComissao: null,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const VENDEDOR_CREATE_EXAMPLE: VendedorCreate = {
  codigoErp: "000234",
  nome: "FABIANO OLIVEIRA",
  nomeReduzido: "FABIANO",
  telefone: "(67) 3354-9465",
  email: "",
  dataNascimento: null,
  usuarioId: null,
  tipo: "vendedor",
  vinculo: "clt",
  usaDashboard: true,
  supervisorId: null,
  gerenteId: null,
  ativo: true,
  desligado: false,
};
