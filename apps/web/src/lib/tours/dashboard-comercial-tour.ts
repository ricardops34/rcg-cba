import type { TourDefinicao } from "./tour-tipos";

export const DASHBOARD_COMERCIAL_TOUR: TourDefinicao = {
  codigo: "dashboard-comercial",
  versao: 1,
  rota: "/comercial/dashboard",
  passos: [
    {
      titulo: "Dashboard Comercial",
      descricao:
        "Esta rotina compara os objetivos comerciais com o resultado realizado no período. Use-a para acompanhar vendas, clientes positivados, devoluções e cobertura da base.",
    },
    {
      seletor: '[data-tour="dashboard-comercial-cabecalho"]',
      titulo: "Leitura do período",
      descricao:
        "O cabeçalho confirma o período consultado e informa quando a visão está restrita a um município. A meta continua sendo mensal por vendedor, mesmo ao filtrar uma cidade.",
    },
    {
      seletor: '[data-tour="dashboard-comercial-filtros"]',
      titulo: "Defina o recorte",
      descricao:
        "Escolha mês, ano, vendedor e município. As opções respeitam sua hierarquia e seu escopo de acesso. Clique em Buscar para aplicar o novo recorte aos indicadores.",
    },
    {
      seletor: '[data-tour="dashboard-comercial-resultados"]',
      titulo: "Objetivo e realizado",
      descricao:
        "Os cartões resumem o valor vendido, clientes positivados, devoluções e percentual da base atendida. Cada cartão mostra o realizado e sua relação com a meta ou total correspondente.",
    },
    {
      seletor: '[data-tour="dashboard-comercial-categorias"]',
      titulo: "Vendas por categoria",
      descricao:
        "A tabela detalha quanto cada categoria contribuiu para as vendas do período e apresenta o total realizado. Quando não houver movimento, a rotina informa isso no próprio quadro.",
    },
    {
      seletor: '[data-tour="refazer-tour"]',
      titulo: "Consulte quando precisar",
      descricao:
        "Use este ícone para refazer o tour desta tela. O ícone de ajuda ao lado abre a documentação completa da rotina.",
    },
  ],
};
