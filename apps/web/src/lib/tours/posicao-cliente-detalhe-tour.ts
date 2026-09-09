import type { TourDefinicao } from "./tour-tipos";

export const POSICAO_CLIENTE_DETALHE_TOUR: TourDefinicao = {
  codigo: "posicao-cliente-detalhe",
  versao: 1,
  rota: "/comercial/posicao-cliente",
  modoRota: "descendente",
  passos: [
    {
      titulo: "Ficha completa do cliente",
      descricao:
        "Aqui você reúne cadastro, contatos, histórico de compras, documentos, títulos e mix de produtos do cliente selecionado. Os dados ajudam a preparar o atendimento e identificar oportunidades ou pendências.",
    },
    {
      seletor: '[data-tour="posicao-cliente-detalhe-cabecalho"]',
      titulo: "Cliente selecionado",
      descricao:
        "Confira o nome e a situação do cadastro. Use a seta para retornar à carteira e escolher outro cliente sem perder o contexto da rotina.",
    },
    {
      seletor: '[data-tour="posicao-cliente-detalhe-cadastro"]',
      titulo: "Cadastro e contatos",
      descricao:
        "Consulte código, documento, vendedor, tabela de preço, localização e datas de compra. Os contatos vinculados permitem abrir diretamente o atendimento pelo WhatsApp, quando disponível.",
    },
    {
      seletor: '[data-tour="posicao-cliente-detalhe-resumo"]',
      titulo: "Resumo comercial e financeiro",
      descricao:
        "Veja rapidamente a quantidade de notas, o total comprado e os valores de títulos em aberto ou vencidos. Havendo devoluções, o total devolvido também aparece neste resumo.",
    },
    {
      seletor: '[data-tour="posicao-cliente-detalhe-abas"]',
      titulo: "Histórico completo",
      descricao:
        "Navegue entre notas fiscais, comodatos, devoluções, títulos a receber e mix de produtos. Os números nas abas indicam quantos registros existem em cada grupo.",
    },
    {
      seletor: '[data-tour="posicao-cliente-detalhe-conteudo"]',
      titulo: "Consulte e abra os documentos",
      descricao:
        "Em cada aba você pode pesquisar e ordenar os registros. Clique em uma nota, título ou produto para ver os detalhes; os atalhos de segunda via aparecem quando o documento está disponível.",
    },
    {
      seletor: '[data-tour="refazer-tour"]',
      titulo: "Consulte quando precisar",
      descricao:
        "Use este ícone para refazer o tour da ficha. O ícone de ajuda ao lado abre a documentação da Posição do Cliente.",
    },
  ],
};
