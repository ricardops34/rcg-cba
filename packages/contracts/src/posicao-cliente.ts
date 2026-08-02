import { z } from "zod";
import { clienteSchema } from "./cliente";
import { notaSaidaSchema } from "./nota-saida";
import { tituloReceberSchema } from "./titulo-receber";

const vendedorRefSchema = z
  .object({ id: z.string().uuid(), nome: z.string(), nomeReduzido: z.string().nullable() })
  .nullable();

const tabelaPrecoRefSchema = z
  .object({ id: z.string().uuid(), codigoErp: z.string(), descricao: z.string() })
  .nullable();

// Posição de Cliente: tela agrupada (cliente + notas + títulos + mix de
// produtos comprados), montada a partir dos mesmos dados read-only do ERP
// já usados em Notas de Saída / Títulos a Receber — cada bloco liga para o
// registro detalhado correspondente.
export const posicaoClienteNotaSchema = notaSaidaSchema.extend({
  vendedor: vendedorRefSchema,
});
export type PosicaoClienteNota = z.infer<typeof posicaoClienteNotaSchema>;

export const posicaoClienteTituloSchema = tituloReceberSchema;
export type PosicaoClienteTitulo = z.infer<typeof posicaoClienteTituloSchema>;

export const posicaoClienteMixSchema = z.object({
  produtoId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
  quantidadeTotal: z.number(),
  vlrTotal: z.number(),
  qtdNotas: z.number().int(),
  ultimaCompra: z.string().datetime().nullable(),
  // Preço vigente do produto na tabela de preço vinculada ao cliente
  // (cliente.tabelaPrecoId) — null se o cliente não tem tabela vinculada ou
  // se o produto não consta nela.
  precoTabela: z.number().nullable(),
});
export type PosicaoClienteMix = z.infer<typeof posicaoClienteMixSchema>;

export const posicaoClienteResumoSchema = z.object({
  totalNotas: z.number().int(),
  totalComprado: z.number(),
  totalTitulosAberto: z.number(),
  totalTitulosVencido: z.number(),
});
export type PosicaoClienteResumo = z.infer<typeof posicaoClienteResumoSchema>;

export const posicaoClienteSchema = z.object({
  cliente: clienteSchema.extend({ vendedor: vendedorRefSchema, tabelaPreco: tabelaPrecoRefSchema }),
  resumo: posicaoClienteResumoSchema,
  notas: z.array(posicaoClienteNotaSchema),
  titulos: z.array(posicaoClienteTituloSchema),
  mix: z.array(posicaoClienteMixSchema),
});
export type PosicaoCliente = z.infer<typeof posicaoClienteSchema>;
