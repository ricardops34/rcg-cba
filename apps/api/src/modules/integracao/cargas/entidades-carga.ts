import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import {
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
  type IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { IntegracaoArmazensService } from '../armazens/integracao-armazens.service';
import { IntegracaoCategoriasService } from '../categorias/integracao-categorias.service';
import { IntegracaoClientesService } from '../clientes/integracao-clientes.service';
import { IntegracaoCondicoesPagamentoService } from '../condicoes-pagamento/integracao-condicoes-pagamento.service';
import { IntegracaoEstoqueService } from '../estoque/integracao-estoque.service';
import { IntegracaoFornecedoresService } from '../fornecedores/integracao-fornecedores.service';
import { IntegracaoNotasEntradaService } from '../notas-entrada/integracao-notas-entrada.service';
import { IntegracaoNotasSaidaService } from '../notas-saida/integracao-notas-saida.service';
import { IntegracaoObjetivosService } from '../objetivos/integracao-objetivos.service';
import { IntegracaoOrcamentosService } from '../orcamentos/integracao-orcamentos.service';
import { IntegracaoPedidosService } from '../pedidos/integracao-pedidos.service';
import { IntegracaoProdutosService } from '../produtos/integracao-produtos.service';
import { IntegracaoRegrasDescontoService } from '../regras-desconto/integracao-regras-desconto.service';
import { IntegracaoTabelasPrecoService } from '../tabelas-preco/integracao-tabelas-preco.service';
import { IntegracaoTitulosReceberService } from '../titulos-receber/integracao-titulos-receber.service';
import { IntegracaoVendedoresService } from '../vendedores/integracao-vendedores.service';

/**
 * Como aplicar uma entidade da carga: o schema do item do `PUT` e o
 * `upsertLote` do service. **Os mesmos do `PUT /integracao/<entidade>`** — o
 * arquivo não é um segundo contrato, e o que passa num passa no outro.
 */
export interface EntidadeCarga {
  schema: ZodType;
  aplicar: (
    empresaId: string,
    apiKeyId: string,
    registros: unknown[],
  ) => Promise<IntegracaoLoteResultado>;
}

@Injectable()
export class EntidadesCarga {
  private readonly mapa: Record<IntegracaoCargaEntidade, EntidadeCarga>;

  constructor(
    regrasDesconto: IntegracaoRegrasDescontoService,
    categorias: IntegracaoCategoriasService,
    condicoesPagamento: IntegracaoCondicoesPagamentoService,
    armazens: IntegracaoArmazensService,
    vendedores: IntegracaoVendedoresService,
    fornecedores: IntegracaoFornecedoresService,
    produtos: IntegracaoProdutosService,
    estoque: IntegracaoEstoqueService,
    tabelasPreco: IntegracaoTabelasPrecoService,
    clientes: IntegracaoClientesService,
    titulosReceber: IntegracaoTitulosReceberService,
    objetivos: IntegracaoObjetivosService,
    notasSaida: IntegracaoNotasSaidaService,
    notasEntrada: IntegracaoNotasEntradaService,
    orcamentos: IntegracaoOrcamentosService,
    pedidos: IntegracaoPedidosService,
  ) {
    // O cast em `registros` é seguro porque cada item passou pelo `schema` da
    // mesma linha antes de chegar aqui (ver CargasProcessador).

    this.mapa = {
      'regras-desconto': {
        schema: integracaoRegraDescontoLoteItemSchema,
        aplicar: (e, k, r) => regrasDesconto.upsertLote(e, k, r as any),
      },
      categorias: {
        schema: integracaoCategoriaLoteItemSchema,
        aplicar: (e, k, r) => categorias.upsertLote(e, k, r as any),
      },
      'condicoes-pagamento': {
        schema: integracaoCondicaoPagamentoLoteItemSchema,
        aplicar: (e, k, r) => condicoesPagamento.upsertLote(e, k, r as any),
      },
      armazens: {
        schema: integracaoArmazemLoteItemSchema,
        aplicar: (e, k, r) => armazens.upsertLote(e, k, r as any),
      },
      vendedores: {
        schema: integracaoVendedorLoteItemSchema,
        aplicar: (e, k, r) => vendedores.upsertLote(e, k, r as any),
      },
      fornecedores: {
        schema: integracaoFornecedorLoteItemSchema,
        aplicar: (e, k, r) => fornecedores.upsertLote(e, k, r as any),
      },
      produtos: {
        schema: integracaoProdutoLoteItemSchema,
        aplicar: (e, k, r) => produtos.upsertLote(e, k, r as any),
      },
      estoque: {
        schema: integracaoEstoqueLoteItemSchema,
        aplicar: (e, k, r) => estoque.upsertLote(e, k, r as any),
      },
      'tabelas-preco': {
        schema: integracaoTabelaPrecoLoteItemSchema,
        aplicar: (e, k, r) => tabelasPreco.upsertLote(e, k, r as any),
      },
      clientes: {
        schema: integracaoClienteLoteItemSchema,
        aplicar: (e, k, r) => clientes.upsertLote(e, k, r as any),
      },
      'titulos-receber': {
        schema: integracaoTituloReceberLoteItemSchema,
        aplicar: (e, k, r) => titulosReceber.upsertLote(e, k, r as any),
      },
      objetivos: {
        schema: integracaoObjetivoLoteItemSchema,
        aplicar: (e, k, r) => objetivos.upsertLote(e, k, r as any),
      },
      'notas-saida': {
        schema: integracaoNotaSaidaLoteItemSchema,
        aplicar: (e, k, r) => notasSaida.upsertLote(e, k, r as any),
      },
      'notas-entrada': {
        schema: integracaoNotaEntradaLoteItemSchema,
        aplicar: (e, k, r) => notasEntrada.upsertLote(e, k, r as any),
      },
      orcamentos: {
        schema: integracaoOrcamentoLoteItemSchema,
        aplicar: (e, k, r) => orcamentos.upsertLote(e, k, r as any),
      },
      pedidos: {
        schema: integracaoPedidoLoteItemSchema,
        aplicar: (e, k, r) => pedidos.upsertLote(e, k, r as any),
      },
    };
  }

  de(entidade: IntegracaoCargaEntidade): EntidadeCarga {
    return this.mapa[entidade];
  }
}
