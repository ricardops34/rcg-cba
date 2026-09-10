import type { TourDefinicao, TourPasso } from "./tour-tipos";

const PASSOS_FORMULARIO: TourPasso[] = [
  {
    seletor: '[data-tour="orcamento-cliente"]',
    titulo: "Comece pelo cliente",
    descricao:
      "Selecione o cliente da proposta. Quando a criação vem de um atalho com cliente definido, ele já aparece preenchido e não pode ser trocado nesse cadastro.",
  },
  {
    seletor: '[data-tour="orcamento-vendedor"]',
    titulo: "Responsável pela venda",
    descricao:
      "O vendedor vem do cadastro do cliente. Se o cliente não tiver vendedor cadastrado, selecione um responsável entre as opções do seu escopo.",
  },
  {
    seletor: '[data-tour="orcamento-pagamento"]',
    titulo: "Condições da proposta",
    descricao:
      "Confira a condição de pagamento. Você também pode vincular uma oportunidade entre as opções disponíveis para o vendedor.",
  },
  {
    seletor: '[data-tour="orcamento-prazos"]',
    titulo: "Situação, validade e retorno",
    descricao:
      "Confira o status comercial, a validade e a data e hora de retorno para acompanhamento. A aprovação depende das regras da proposta e de eventual autorização de desconto.",
  },
  {
    seletor: '[data-tour="orcamento-itens"]',
    titulo: "Monte os itens",
    descricao:
      "Depois de selecionar o cliente, abra Itens para adicionar produtos e conferir quantidades, preços, descontos e estoque. O total acompanha os itens informados.",
  },
  {
    seletor: '[data-tour="orcamento-mix"]',
    titulo: "Consulte o que o cliente já compra",
    descricao:
      "Mix de produtos reúne o histórico de compras do cliente, com últimos preços e descontos. Produtos ativos podem ser adicionados à proposta; os já incluídos ficam sinalizados.",
  },
  {
    seletor: '[data-tour="orcamento-advertencias"]',
    titulo: "Revise os alertas",
    descricao:
      "Advertências reúne sinais sobre o cliente, estoque e descontos. Confira os detalhes antes de salvar. Descontos que exigem autorização bloqueiam PDF e efetivação até a liberação.",
  },
  {
    seletor: '[data-tour="orcamento-autorizacao"]',
    titulo: "Autorização de desconto",
    descricao:
      "Este aviso mostra se a autorização ainda precisa ser solicitada, está pendente ou já foi concedida. Salve primeiro para solicitar; autorizar depende de permissão específica.",
  },
  {
    seletor: '[data-tour="orcamento-historico"]',
    titulo: "Contexto do atendimento",
    descricao:
      "O Histórico mostra os atendimentos do cliente selecionado e ajuda a recuperar o contexto da negociação.",
  },
];

export const ORCAMENTO_NOVO_TOUR: TourDefinicao = {
  codigo: "orcamento-novo",
  versao: 1,
  rota: "/crm/orcamentos/novo",
  seletorPronto: '[data-tour="orcamento-form"]',
  passos: [
    {
      titulo: "Prepare uma proposta",
      descricao:
        "Este tour apresenta o cadastro de orçamento. Confira o cliente, as condições e os itens antes de gravar. As abas permitem consultar o mix e revisar advertências durante a negociação.",
    },
    ...PASSOS_FORMULARIO,
    {
      seletor: '[data-tour="orcamento-acoes"]',
      titulo: "Salve e continue ou finalize",
      descricao:
        "Salvar grava e mantém a tela aberta. Cadastrar e fechar grava e retorna à listagem. Depois de salvo, ficam disponíveis PDF, cópia e informações de integração, respeitando as regras da proposta.",
    },
  ],
};

export const ORCAMENTO_DETALHE_TOUR: TourDefinicao = {
  codigo: "orcamento-detalhe",
  versao: 1,
  rota: "/crm/orcamentos",
  modoRota: "descendente",
  seletorPronto: '[data-tour="orcamento-form"]',
  passos: [
    {
      titulo: "Consulte ou revise a proposta",
      descricao:
        "Confira as condições e os itens do orçamento salvo. Propostas aprovadas ou expiradas não aceitam alterações; use Copiar quando precisar preparar uma nova proposta a partir delas.",
    },
    {
      seletor: '[data-tour="orcamento-bloqueio"]',
      titulo: "Proposta bloqueada para edição",
      descricao:
        "O aviso informa por que este orçamento não pode ser alterado. Uma cópia cria uma nova proposta e reinicia a validade, sem alterar o registro original.",
    },
    ...PASSOS_FORMULARIO,
    {
      seletor: '[data-tour="orcamento-integracao"]',
      titulo: "Aprovação e integração",
      descricao:
        "Esta aba mostra a situação salva, o código ERP e as datas do registro. Apenas propostas aprovadas ficam disponíveis para importação; sem código ERP, ainda aguardam o vínculo.",
    },
    {
      seletor: '[data-tour="orcamento-acoes"]',
      titulo: "Ações da proposta",
      descricao:
        "Quando a edição estiver liberada, Salvar mantém a tela aberta e Salvar e fechar retorna à listagem. Gerar PDF depende das regras de desconto. Copiar inicia uma nova proposta com base nesta.",
    },
  ],
};
