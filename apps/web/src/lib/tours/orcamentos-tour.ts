import type { TourDefinicao } from "./tour-tipos";

export const ORCAMENTOS_TOUR: TourDefinicao = {
  codigo: "orcamentos",
  versao: 1,
  rota: "/crm/orcamentos",
  passos: [
    {
      titulo: "Orçamentos",
      descricao:
        "Acompanhe as propostas comerciais da empresa dentro do seu escopo de acesso. Esta lista reúne cliente, vendedor, situação, valor e validade de cada orçamento.",
    },
    {
      seletor: '[data-tour="orcamentos-busca"]',
      titulo: "Localize ou prepare uma proposta",
      descricao:
        "Use a busca para localizar orçamentos, atualize a listagem ou acesse Novo orçamento para preparar uma proposta. As operações dependem das permissões do seu perfil.",
    },
    {
      seletor: '[data-tour="orcamentos-filtros"]',
      titulo: "Separe cadastro e situação comercial",
      descricao:
        "Os atalhos mostram registros ativos, inativos ou todos. Em Filtros, escolha a situação comercial da proposta e, quando disponível para seu perfil, o vendedor. Ativo e situação comercial são informações diferentes.",
    },
    {
      seletor: '[data-tour="orcamentos-lista"]',
      titulo: "Compare as propostas",
      descricao:
        "Confira cliente, vendedor, status, total e validade. A indicação de origem ao lado do vendedor identifica propostas preparadas por outro canal. Use os cabeçalhos disponíveis para ordenar e a paginação para percorrer os resultados.",
    },
    {
      seletor: '[data-tour="orcamentos-lista"]',
      titulo: "Acompanhe a integração",
      descricao:
        "Em propostas aprovadas, o relógio indica que ainda se aguarda o vínculo com o ERP; a confirmação verde indica que o código ERP já foi registrado. Nas demais situações, a coluna mostra um traço.",
    },
    {
      seletor: '[data-tour="orcamentos-lista"]',
      titulo: "Abra o orçamento",
      descricao:
        "Clique na linha para abrir a proposta. O menu de ações oferece edição e exclusão, sujeitas às permissões e regras da rotina; a exclusão pede confirmação.",
    },
    {
      seletor: '[data-tour="refazer-tour"]',
      titulo: "Reveja quando precisar",
      descricao:
        "Use este ícone para repetir o tour. A ajuda ao lado explica os filtros e a leitura da listagem.",
    },
  ],
};
