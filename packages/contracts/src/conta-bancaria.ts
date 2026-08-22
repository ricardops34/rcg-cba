import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

/**
 * Convênio de cobrança da empresa — o que a 2ª via de boleto precisa saber
 * sobre o beneficiário (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * A plataforma **reimprime** boleto já registrado pelo ERP; não numera nem
 * registra no banco. Por isso aqui não há sequencial de nosso número: ele vem
 * no título.
 */

// Bancos com cálculo de campo livre implementado. É enum, e não texto livre,
// porque cada banco tem uma montagem própria do código de barras — aceitar um
// código sem gerador seria cadastrar uma conta que nunca imprime.
export const bancoBoletoSchema = z.enum(["237"]).describe("Código de compensação do banco (237 = Bradesco)");
export type BancoBoleto = z.infer<typeof bancoBoletoSchema>;

export const BANCO_BOLETO_LABEL: Record<BancoBoleto, string> = {
  "237": "Bradesco",
};

// Só dígitos, sem máscara — é o que entra no código de barras.
const digitos = (max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "Use apenas dígitos")
    .max(max);

export const contaBancariaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  descricao: z.string(),
  banco: z.string(),
  agencia: z.string(),
  agenciaDv: z.string().nullable(),
  conta: z.string(),
  contaDv: z.string().nullable(),
  carteira: z.string(),
  beneficiarioNome: z.string().nullable(),
  beneficiarioDocumento: z.string().nullable(),
  beneficiarioEndereco: z.string().nullable(),
  localPagamento: z.string(),
  aceite: z.string(),
  especieDocumento: z.string(),
  instrucoes: z.string().nullable(),
  demonstrativo: z.string().nullable(),
  jurosMesPerc: z.number().nullable(),
  multaPerc: z.number().nullable(),
  diasProtesto: z.number().int().nullable(),
  padrao: z.boolean(),
  ativo: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type ContaBancaria = z.infer<typeof contaBancariaSchema>;

export const contaBancariaCreateSchema = z.object({
  descricao: z.string().trim().min(1).max(80).describe('Como a conta aparece nas telas (ex.: "Bradesco 237 — carteira 09")'),
  banco: bancoBoletoSchema,
  agencia: digitos(5).describe("Agência sem o dígito verificador"),
  agenciaDv: digitos(1).nullish(),
  conta: digitos(9).describe("Conta corrente sem o dígito verificador"),
  contaDv: digitos(1).nullish(),
  carteira: digitos(2).describe("Carteira da cobrança (Bradesco: 09, 06, 19...)"),
  beneficiarioNome: z.string().trim().max(120).nullish().describe("Nulo = usa a razão social da empresa"),
  beneficiarioDocumento: z.string().trim().max(20).nullish(),
  beneficiarioEndereco: z.string().trim().max(200).nullish(),
  localPagamento: z.string().trim().max(120).default("Pagável em qualquer banco até o vencimento"),
  aceite: z.string().trim().max(1).default("N"),
  especieDocumento: z.string().trim().max(5).default("DM"),
  instrucoes: z.string().trim().max(1000).nullish().describe("Instruções ao caixa, uma por linha"),
  demonstrativo: z.string().trim().max(1000).nullish(),
  jurosMesPerc: z.number().min(0).max(100).nullish(),
  multaPerc: z.number().min(0).max(100).nullish(),
  diasProtesto: z.number().int().min(0).max(999).nullish(),
  padrao: z.boolean().default(false).describe("Conta usada pelos títulos que não apontam nenhuma — só uma por empresa"),
  ativo: z.boolean().default(true),
});
export type ContaBancariaCreate = z.infer<typeof contaBancariaCreateSchema>;

export const contaBancariaUpdateSchema = contaBancariaCreateSchema.partial();
export type ContaBancariaUpdate = z.infer<typeof contaBancariaUpdateSchema>;

export const contaBancariaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type ContaBancariaQuery = z.infer<typeof contaBancariaQuerySchema>;

export const CONTA_BANCARIA_EXAMPLE: ContaBancaria = {
  id: "0f2c9c1a-7b3d-4e5f-8a91-b2c3d4e5f607",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  descricao: "Bradesco 237 — carteira 09",
  banco: "237",
  agencia: "1234",
  agenciaDv: "5",
  conta: "0567890",
  contaDv: "1",
  carteira: "09",
  beneficiarioNome: null,
  beneficiarioDocumento: null,
  beneficiarioEndereco: null,
  localPagamento: "Pagável em qualquer banco até o vencimento",
  aceite: "N",
  especieDocumento: "DM",
  instrucoes: "Após o vencimento, cobrar multa de 2% e juros de 1% ao mês.",
  demonstrativo: null,
  jurosMesPerc: 1,
  multaPerc: 2,
  diasProtesto: null,
  padrao: true,
  ativo: true,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const CONTA_BANCARIA_CREATE_EXAMPLE: ContaBancariaCreate = {
  descricao: "Bradesco 237 — carteira 09",
  banco: "237",
  agencia: "1234",
  agenciaDv: "5",
  conta: "0567890",
  contaDv: "1",
  carteira: "09",
  localPagamento: "Pagável em qualquer banco até o vencimento",
  aceite: "N",
  especieDocumento: "DM",
  instrucoes: "Após o vencimento, cobrar multa de 2% e juros de 1% ao mês.",
  jurosMesPerc: 1,
  multaPerc: 2,
  padrao: true,
  ativo: true,
};
