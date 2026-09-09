import type { TourDefinicao } from "./tour-tipos";

export const POSICAO_CLIENTE_TOUR: TourDefinicao = {
  codigo: "posicao-cliente",
  versao: 1,
  rota: "/comercial/posicao-cliente",
  passos: [
    {
      titulo: "Posição do Cliente",
      descricao:
        "Esta rotina reúne a carteira comercial e os principais sinais de cada cliente. Ela ajuda a identificar quem precisa de contato, clientes sem compras recentes e situações financeiras que merecem atenção.",
    },
    {
      seletor: '[data-tour="posicao-cliente-busca"]',
      titulo: "Encontre um cliente",
      descricao:
        "Pesquise pelo cliente e use Atualizar para buscar novamente os dados mais recentes. A listagem sempre respeita os clientes e equipes que seu perfil pode visualizar.",
    },
    {
      seletor: '[data-tour="posicao-cliente-filtros-rapidos"]',
      titulo: "Priorize sua carteira",
      descricao:
        "Alterne entre clientes ativos e inativos ou selecione há quantos dias eles não compram. Esses atalhos ajudam a montar rapidamente uma lista de acompanhamento.",
    },
    {
      seletor: '[data-tour="posicao-cliente-filtros-avancados"]',
      titulo: "Refine a consulta",
      descricao:
        "Abra Filtros para combinar UF, município, vendedor e vínculo de carteira. As opções disponíveis acompanham seu escopo comercial e os demais filtros escolhidos.",
    },
    {
      seletor: '[data-tour="posicao-cliente-legenda-titulos"]',
      titulo: "Situação dos títulos",
      descricao:
        "O símbolo de cifrão resume a situação mais urgente dos títulos em aberto: vermelho para vencido, azul para vencimento em até sete dias e verde para ainda não vencido.",
    },
    {
      seletor: '[data-tour="posicao-cliente-lista"]',
      titulo: "Leia os indicadores",
      descricao:
        "Compare última compra, vendas dos últimos 30 dias, média de 90 dias e a diferença entre o mês e a média. Clique nos títulos das colunas para ordenar e use a engrenagem para escolher quais colunas exibir.",
    },
    {
      seletor: '[data-tour="posicao-cliente-lista"]',
      titulo: "Abra as ações do cliente",
      descricao:
        "Clique em uma linha para abrir a posição completa. No menu ao fim da linha, conforme suas permissões, você também pode visualizar ou alterar o cadastro, incluir orçamento e acessar uma conversa.",
    },
    {
      seletor: '[data-tour="refazer-tour"]',
      titulo: "Consulte quando precisar",
      descricao:
        "Use este ícone para refazer o tour desta tela. O ícone de ajuda ao lado abre a documentação completa da rotina.",
    },
  ],
};
