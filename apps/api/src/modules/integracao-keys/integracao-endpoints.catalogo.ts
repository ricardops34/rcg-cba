export interface IntegracaoEndpointCatalogoItem {
  endpointKey: string;
  nome: string;
  descricao: string;
  metodos: string[];
  rota: string;
}

export const CATALOGO_ENDPOINTS_INTEGRACAO: IntegracaoEndpointCatalogoItem[] = [
  {
    endpointKey: 'produtos',
    nome: 'Produtos',
    descricao: 'Catálogo de produtos, preços de referência, embalagem e atributos.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/produtos',
  },
  {
    endpointKey: 'clientes',
    nome: 'Clientes',
    descricao: 'Cadastro comercial de clientes e envio para fila de aprovação.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/clientes',
  },
  {
    endpointKey: 'notas-saida',
    nome: 'Notas de Saída (Faturamento)',
    descricao: 'Cabeçalho e itens de notas fiscais de saída, com envio de XML de NF-e.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/notas-saida',
  },
  {
    endpointKey: 'notas-entrada',
    nome: 'Notas de Entrada (Compras)',
    descricao: 'Documentos fiscais de entrada, compras e devoluções de vendas.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/notas-entrada',
  },
  {
    endpointKey: 'titulos-receber',
    nome: 'Títulos a Receber',
    descricao: 'Títulos financeiros, parcelamento e dados de cobrança bancária.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/titulos-receber',
  },
  {
    endpointKey: 'estoque',
    nome: 'Estoque',
    descricao: 'Posição atual de saldo por produto e armazém.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/estoque',
  },
  {
    endpointKey: 'tabelas-preco',
    nome: 'Tabelas de Preço',
    descricao: 'Tabelas de preço e itens com preços por produto.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/tabelas-preco',
  },
  {
    endpointKey: 'vendedores',
    nome: 'Vendedores',
    descricao: 'Cadastro de vendedores, supervisores e representantes.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/vendedores',
  },
  {
    endpointKey: 'fornecedores',
    nome: 'Fornecedores',
    descricao: 'Cadastro de fornecedores para compras e notas de entrada.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/fornecedores',
  },
  {
    endpointKey: 'categorias',
    nome: 'Categorias',
    descricao: 'Hierarquia de categorias e subcategorias de produtos.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/categorias',
  },
  {
    endpointKey: 'condicoes-pagamento',
    nome: 'Condições de Pagamento',
    descricao: 'Planos e prazos de pagamento de vendas.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/condicoes-pagamento',
  },
  {
    endpointKey: 'armazens',
    nome: 'Armazéns',
    descricao: 'Locais físicos de estoque e depósitos.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/armazens',
  },
  {
    endpointKey: 'regras-desconto',
    nome: 'Regras de Desconto',
    descricao: 'Tabelas e faixas de percentual de desconto autorizadas.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/regras-desconto',
  },
  {
    endpointKey: 'objetivos',
    nome: 'Objetivos de Venda',
    descricao: 'Metas comerciais por vendedor, mês e categoria.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/objetivos',
  },
  {
    endpointKey: 'orcamentos',
    nome: 'Orçamentos e Pedidos',
    descricao: 'Sincronização de propostas e consulta de pedidos pendentes.',
    metodos: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    rota: '/api/v1/integracao/orcamentos',
  },
  {
    endpointKey: 'arquivo',
    nome: 'Arquivos TXT Protheus',
    descricao: 'Importação e exportação de arquivos em lote (TXT/JSON).',
    metodos: ['GET', 'POST'],
    rota: '/api/v1/integracao/arquivo',
  },
];
