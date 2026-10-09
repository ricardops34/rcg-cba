import type { IntegracaoCargaEntidade } from "./integracao-carga";
import {
  INTEGRACAO_ARMAZEM_CREATE_EXAMPLE,
  INTEGRACAO_CATEGORIA_CREATE_EXAMPLE,
  INTEGRACAO_CLIENTE_CREATE_EXAMPLE,
  INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE,
  INTEGRACAO_ESTOQUE_CREATE_EXAMPLE,
  INTEGRACAO_FORNECEDOR_CREATE_EXAMPLE,
  INTEGRACAO_NOTA_ENTRADA_CREATE_EXAMPLE,
  INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE,
  INTEGRACAO_OBJETIVO_CREATE_EXAMPLE,
  INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE,
  INTEGRACAO_PEDIDO_CREATE_EXAMPLE,
  INTEGRACAO_PRODUTO_CREATE_EXAMPLE,
  INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE,
  INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE,
  INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE,
  INTEGRACAO_VENDEDOR_CREATE_EXAMPLE,
} from "./integracao";

/**
 * O formato de cada entidade no arquivo de carga, para a documentação da tela
 * de Upload (Administração → Integração). O exemplo é o MESMO do Swagger
 * (`INTEGRACAO_*_CREATE_EXAMPLE`): uma fonte só, e um teste da API
 * (formatos-carga.spec.ts) valida cada exemplo no schema que a carga aplica —
 * campo novo no contrato sem exemplo atualizado quebra o teste.
 *
 * `chave` é como o SQL da carga inicial (docs/integracao/sql/01-instalar.sql)
 * monta a identidade do registro; `dependeDe`, as entidades que precisam ter
 * chegado antes (docs/integracao/README.md, ordem de carga).
 */
export interface IntegracaoCargaFormato {
  nome: string;
  chave: string;
  dependeDe: IntegracaoCargaEntidade[];
  observacao?: string;
  exemplo: object;
}

export const INTEGRACAO_CARGA_FORMATOS: Record<
  IntegracaoCargaEntidade,
  IntegracaoCargaFormato
> = {
  "regras-desconto": {
    nome: "Regras de desconto",
    chave: "Z0_FILIAL-Z0_CODIGO",
    dependeDe: [],
    exemplo: INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE,
  },
  categorias: {
    nome: "Categorias",
    chave: "Z1_FILIAL-Z1_TIPO (categoria) · BM_FILIAL-BM_GRUPO (subcategoria)",
    dependeDe: ["regras-desconto"],
    observacao:
      "Subcategoria leva categoriaPaiChave; a categoria pai precisa vir antes, no mesmo arquivo ou num anterior.",
    exemplo: INTEGRACAO_CATEGORIA_CREATE_EXAMPLE,
  },
  "condicoes-pagamento": {
    nome: "Condições de pagamento",
    chave: "E4_FILIAL-E4_CODIGO",
    dependeDe: [],
    exemplo: INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE,
  },
  armazens: {
    nome: "Armazéns",
    chave: "NNR_FILIAL-NNR_CODIGO",
    dependeDe: [],
    exemplo: INTEGRACAO_ARMAZEM_CREATE_EXAMPLE,
  },
  vendedores: {
    nome: "Vendedores",
    chave: "A3_FILIAL-A3_COD",
    dependeDe: [],
    exemplo: INTEGRACAO_VENDEDOR_CREATE_EXAMPLE,
  },
  fornecedores: {
    nome: "Fornecedores",
    chave: "A2_FILIAL-A2_COD-A2_LOJA",
    dependeDe: [],
    exemplo: INTEGRACAO_FORNECEDOR_CREATE_EXAMPLE,
  },
  produtos: {
    nome: "Produtos",
    chave: "B1_FILIAL-B1_COD",
    dependeDe: ["categorias", "armazens"],
    exemplo: INTEGRACAO_PRODUTO_CREATE_EXAMPLE,
  },
  estoque: {
    nome: "Estoque",
    chave: "B2_FILIAL-B2_COD-B2_LOCAL",
    dependeDe: ["produtos", "armazens"],
    exemplo: INTEGRACAO_ESTOQUE_CREATE_EXAMPLE,
  },
  "tabelas-preco": {
    nome: "Tabelas de preço",
    chave: "DA0_FILIAL-DA0_CODTAB; item: DA1_FILIAL-DA0_CODTAB-DA1_CODPRO-DA1_ITEM",
    dependeDe: ["produtos", "regras-desconto"],
    observacao: "Os itens substituem o conjunto inteiro da tabela a cada envio.",
    exemplo: INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE,
  },
  clientes: {
    nome: "Clientes",
    chave: "A1_FILIAL-A1_COD-A1_LOJA",
    dependeDe: ["vendedores", "tabelas-preco", "condicoes-pagamento"],
    exemplo: INTEGRACAO_CLIENTE_CREATE_EXAMPLE,
  },
  "titulos-receber": {
    nome: "Títulos a receber",
    chave: "E1_FILIAL-E1_PREFIXO-E1_NUM-E1_PARCELA-E1_TIPO",
    dependeDe: ["clientes", "vendedores"],
    exemplo: INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE,
  },
  objetivos: {
    nome: "Objetivos (metas)",
    chave: "Escolhida por quem gera; sugestão: <vendedorChave>-<AAAA>-<MM>",
    dependeDe: ["vendedores", "categorias"],
    observacao:
      "Sem origem no Protheus. As metas por categoria substituem o conjunto inteiro da meta a cada envio.",
    exemplo: INTEGRACAO_OBJETIVO_CREATE_EXAMPLE,
  },
  "notas-saida": {
    nome: "Notas de saída",
    chave:
      "F2_FILIAL-F2_DOC-F2_SERIE-F2_CLIENTE-F2_LOJA-F2_FORMUL-F2_TIPO; item: D2_FILIAL-D2_DOC-D2_SERIE-D2_CLIENTE-D2_LOJA-D2_COD-D2_ITEM",
    dependeDe: ["clientes", "vendedores", "condicoes-pagamento", "produtos"],
    observacao: "Cabeçalho e itens sempre juntos; o item que não vier mais é removido.",
    exemplo: INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE,
  },
  "notas-entrada": {
    nome: "Notas de entrada",
    chave:
      "F1_FILIAL-F1_DOC-F1_SERIE-F1_FORNECE-F1_LOJA-F1_FORMUL-F1_TIPO; item: D1_FILIAL-D1_DOC-D1_SERIE-D1_FORNECE-D1_LOJA-D1_COD-D1_ITEM",
    dependeDe: ["fornecedores", "clientes", "condicoes-pagamento", "produtos", "armazens"],
    observacao: "Compra (tipo N) aponta para fornecedor; devolução de venda (tipo D), para cliente.",
    exemplo: INTEGRACAO_NOTA_ENTRADA_CREATE_EXAMPLE,
  },
  orcamentos: {
    nome: "Orçamentos",
    chave: "FILIAL-número do orçamento",
    dependeDe: ["clientes", "vendedores", "condicoes-pagamento", "produtos"],
    exemplo: INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE,
  },
  pedidos: {
    nome: "Pedidos",
    chave: "C5_FILIAL-C5_NUM; item: C6_FILIAL-C6_NUM-C6_ITEM-C6_PRODUTO",
    dependeDe: ["clientes", "vendedores", "condicoes-pagamento", "produtos", "orcamentos"],
    observacao: "Por último: o pedido da plataforma precisa do orçamento já vinculado.",
    exemplo: INTEGRACAO_PEDIDO_CREATE_EXAMPLE,
  },
};
