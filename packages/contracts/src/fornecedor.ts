import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Espelho read-only do ERP: sem create/update — o cadastro entra e sai só pela
// API de integração (`/integracao/fornecedores`).

export const fornecedorSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string().nullable(),

  tipoPessoa: z.enum(["fisica", "juridica"]),
  razaoSocial: z.string(),
  nomeFantasia: z.string().nullable(),
  cnpjCpf: z.string().nullable(),
  inscricaoEstadual: z.string().nullable(),
  inscricaoMunicipal: z.string().nullable(),

  contato: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  celular: z.string().nullable(),

  endereco: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),

  observacao: z.string().nullable(),
  ativo: z.boolean(),

  ...auditFieldsSchema.shape,
});
export type Fornecedor = z.infer<typeof fornecedorSchema>;

export const fornecedorQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  uf: z.string().trim().max(2).optional(),
});
export type FornecedorQuery = z.infer<typeof fornecedorQuerySchema>;

export const FORNECEDOR_EXAMPLE: Fornecedor = {
  id: "4f8a1b2c-3d4e-4f50-a617-28394a5b6c7d",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "F00042",
  tipoPessoa: "juridica",
  razaoSocial: "Distribuidora Serra Azul Ltda",
  nomeFantasia: "Serra Azul",
  cnpjCpf: "04252011000110",
  inscricaoEstadual: "283910457",
  inscricaoMunicipal: null,
  contato: "Marina Prado",
  email: "compras@serraazul.com.br",
  telefone: "6733214455",
  celular: "67998877665",
  endereco: "Rua das Palmeiras, 1240",
  complemento: "Galpão 3",
  bairro: "Distrito Industrial",
  municipio: "Campo Grande",
  uf: "MS",
  cep: "79108250",
  observacao: null,
  ativo: true,
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};
