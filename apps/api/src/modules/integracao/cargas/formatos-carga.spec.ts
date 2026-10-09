import {
  INTEGRACAO_CARGA_ENTIDADES,
  INTEGRACAO_CARGA_FORMATOS,
  integracaoArmazemLoteItemSchema,
  integracaoCategoriaLoteItemSchema,
  integracaoClienteLoteItemSchema,
  integracaoCondicaoPagamentoLoteItemSchema,
  integracaoEstoqueLoteItemSchema,
  integracaoFornecedorLoteItemSchema,
  integracaoNotaEntradaLoteItemSchema,
  integracaoNotaSaidaLoteItemSchema,
  integracaoObjetivoLoteItemSchema,
  integracaoOrcamentoLoteItemSchema,
  integracaoPedidoLoteItemSchema,
  integracaoProdutoLoteItemSchema,
  integracaoRegraDescontoLoteItemSchema,
  integracaoTabelaPrecoLoteItemSchema,
  integracaoTituloReceberLoteItemSchema,
  integracaoVendedorLoteItemSchema,
  type IntegracaoCargaEntidade,
} from '@plataforma/contracts';
import type { ZodType } from 'zod';

/**
 * A documentação da tela de Upload mostra, por entidade, um exemplo de linha
 * do arquivo (INTEGRACAO_CARGA_FORMATOS). Se o exemplo não passar no schema
 * que a carga aplica (entidades-carga.ts), a tela ensina um formato que a API
 * recusa.
 */
const SCHEMA_DA_CARGA: Record<IntegracaoCargaEntidade, ZodType> = {
  'regras-desconto': integracaoRegraDescontoLoteItemSchema,
  categorias: integracaoCategoriaLoteItemSchema,
  'condicoes-pagamento': integracaoCondicaoPagamentoLoteItemSchema,
  armazens: integracaoArmazemLoteItemSchema,
  vendedores: integracaoVendedorLoteItemSchema,
  fornecedores: integracaoFornecedorLoteItemSchema,
  produtos: integracaoProdutoLoteItemSchema,
  estoque: integracaoEstoqueLoteItemSchema,
  'tabelas-preco': integracaoTabelaPrecoLoteItemSchema,
  clientes: integracaoClienteLoteItemSchema,
  'titulos-receber': integracaoTituloReceberLoteItemSchema,
  objetivos: integracaoObjetivoLoteItemSchema,
  'notas-saida': integracaoNotaSaidaLoteItemSchema,
  'notas-entrada': integracaoNotaEntradaLoteItemSchema,
  orcamentos: integracaoOrcamentoLoteItemSchema,
  pedidos: integracaoPedidoLoteItemSchema,
};

describe('formatos da carga por arquivo', () => {
  it.each(INTEGRACAO_CARGA_ENTIDADES)(
    'o exemplo de %s passa no schema da carga',
    (entidade) => {
      const resultado = SCHEMA_DA_CARGA[entidade].safeParse(
        INTEGRACAO_CARGA_FORMATOS[entidade].exemplo,
      );
      expect(resultado.error?.issues ?? []).toEqual([]);
    },
  );

  it('toda dependência é uma entidade da carga', () => {
    for (const formato of Object.values(INTEGRACAO_CARGA_FORMATOS)) {
      for (const dep of formato.dependeDe) {
        expect(INTEGRACAO_CARGA_ENTIDADES).toContain(dep);
      }
    }
  });
});
