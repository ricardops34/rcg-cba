import { z } from "zod";
import { clienteSchema } from "./cliente";
import { notaSaidaSchema } from "./nota-saida";
import { notaEntradaItemSchema, notaEntradaSchema } from "./nota-entrada";
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

// Devolução de venda: a nota que o cliente emitiu de volta, que no ERP entra
// pela SF1 com `tipo = 'D'` (ver `nota-entrada.ts`). Vem com os itens, porque
// a pergunta seguinte a "o cliente devolveu" é sempre "devolveu o quê".
export const posicaoClienteDevolucaoSchema = notaEntradaSchema.extend({
  itens: z.array(
    notaEntradaItemSchema.extend({
      produto: z
        .object({
          id: z.string().uuid(),
          codigoErp: z.string(),
          descricao: z.string(),
          unidade: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
});
export type PosicaoClienteDevolucao = z.infer<
  typeof posicaoClienteDevolucaoSchema
>;

export const posicaoClienteMixSchema = z.object({
  produtoId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
  ultimaCompra: z.string().datetime().nullable(),
  // Preço e desconto (%) praticados na nota mais recente em que o cliente
  // comprou este produto.
  ultimoPrecoUnitario: z.number().nullable(),
  ultimoDesconto: z.number().nullable(),
  // Preço vigente do produto na tabela de preço vinculada ao cliente
  // (cliente.tabelaPrecoId) — null se o cliente não tem tabela vinculada ou
  // se o produto não consta nela.
  precoTabela: z.number().nullable(),
  ativo: z.boolean(),
});
export type PosicaoClienteMix = z.infer<typeof posicaoClienteMixSchema>;

export const posicaoClienteResumoSchema = z.object({
  totalNotas: z.number().int(),
  totalComprado: z.number(),
  totalTitulosAberto: z.number(),
  totalTitulosVencido: z.number(),
  // Contadores da aba de devoluções. **Não** abatem `totalComprado`: quem
  // responde por devolução nas apurações continua sendo `vlrDev` da própria
  // nota de venda, e descontar aqui contaria a mesma devolução duas vezes.
  totalDevolucoes: z.number().int(),
  totalDevolvido: z.number(),
});
export type PosicaoClienteResumo = z.infer<typeof posicaoClienteResumoSchema>;

export const posicaoClienteSchema = z.object({
  cliente: clienteSchema.extend({ vendedor: vendedorRefSchema, tabelaPreco: tabelaPrecoRefSchema }),
  whatsapp: z.array(
    z.object({
      conversaId: z.string().uuid(),
      nome: z.string().nullable(),
      tipo: z.enum(["geral", "financeiro", "compras", "contabilidade_fiscal", "outros"]),
      telefone: z.string().nullable(),
      email: z.string().nullable(),
      fotoUrl: z.string().nullable(),
    }),
  ),
  resumo: posicaoClienteResumoSchema,
  // `notas` é a venda efetiva: só nota ativa e não-comodato. As remessas de
  // comodato (também só as ativas) vêm à parte, em `comodatos`, para a aba
  // própria — misturá-las inflava o histórico e o total comprado.
  notas: z.array(posicaoClienteNotaSchema),
  comodatos: z.array(posicaoClienteNotaSchema),
  // Notas de entrada tipo 'D'. Aba própria pelo mesmo motivo do comodato: não
  // é venda, e somar no total distorceria o "total comprado".
  devolucoes: z.array(posicaoClienteDevolucaoSchema),
  titulos: z.array(posicaoClienteTituloSchema),
  mix: z.array(posicaoClienteMixSchema),
});
export type PosicaoCliente = z.infer<typeof posicaoClienteSchema>;
