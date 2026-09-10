import { AJUDAS_MODULOS } from "./tours/rotinas-modulos";

export interface SecaoAjuda {
  titulo: string;
  texto: string;
  itens?: string[];
}

export interface AjudaRotina {
  codigo: string;
  rota: string;
  modoRota?: "exata" | "descendente";
  titulo: string;
  resumo: string;
  finalidade: string;
  secoes: SecaoAjuda[];
}

export const AJUDAS_ROTINAS: AjudaRotina[] = [
  ...AJUDAS_MODULOS,
  {
    codigo: "orcamentos",
    rota: "/crm/orcamentos",
    titulo: "Orçamentos",
    resumo:
      "Prepare e revise propostas comerciais, acompanhe a validade e o vínculo com o ERP.",
    finalidade:
      "Orçamentos reúne a preparação e o acompanhamento de propostas da empresa ativa. Use a listagem para identificar pendências e o formulário para conferir cliente, condições e itens antes de salvar a negociação.",
    secoes: [
      {
        titulo: "Pré-requisitos",
        texto:
          "É necessário ter acesso à rotina na empresa ativa. A listagem respeita seu escopo comercial; criar, editar e excluir dependem das permissões e regras da operação.",
      },
      {
        titulo: "Busca e filtros",
        texto:
          "Use a busca e os atalhos de ativos, inativos ou todos. Em Filtros, selecione a situação comercial e, quando disponível, o vendedor do seu escopo. Os filtros são aplicados ao mudar a seleção. Limpar os filtros avançados remove a situação e o vendedor, mas mantém a busca e o filtro de ativos. Links de outras telas podem restringir a lista a um cliente.",
      },
      {
        titulo: "Leitura da listagem",
        texto:
          "Confira número, título, cliente, vendedor, status, total, validade e indicador de ativo. A origem ao lado do vendedor informa quando a proposta foi preparada por outro canal. O indicador de ativo não substitui o status comercial. Ordene pelos cabeçalhos disponíveis e use a paginação para consultar os demais resultados.",
      },
      {
        titulo: "Integração com o ERP",
        texto:
          "O indicador aparece apenas para orçamentos aprovados: o relógio sinaliza ausência de código ERP e a confirmação verde sinaliza que o vínculo já foi registrado. As demais situações mostram um traço. A aprovação, sozinha, não confirma a integração.",
      },
      {
        titulo: "Ações e resultado esperado",
        texto:
          "Clique na linha para abrir a proposta ou use o menu de ações para editar ou solicitar exclusão, que exige confirmação. Novo orçamento abre a preparação de uma proposta. Ao final da consulta, você poderá identificar quais propostas precisam de acompanhamento e quais aprovadas ainda aguardam vínculo com o ERP.",
      },
      {
        titulo: "Preparação da proposta",
        texto:
          "Para cadastrar, tenha um cliente disponível no seu escopo e os produtos que serão negociados. Selecione o cliente primeiro: o vendedor vem do cadastro dele; quando não houver vendedor vinculado, escolha o responsável. Em atalhos com cliente predefinido, esse cliente fica fixo durante a criação. Confira a condição de pagamento, a oportunidade opcional, o status, a validade e a data e hora de retorno para acompanhamento.",
      },
      {
        titulo: "Itens e mix de produtos",
        texto:
          "Na aba Itens, adicione produtos e informe quantidades inteiras maiores que zero. Confira preços, descontos, estoque e total. O Mix de produtos mostra compras anteriores do cliente, últimos preços e descontos; permite adicionar produtos ativos que ainda não estejam na proposta. O Histórico reúne os atendimentos do cliente selecionado.",
      },
      {
        titulo: "Advertências e autorização de desconto",
        texto:
          "Revise a aba Advertências para consultar alertas sobre cliente, estoque e descontos. Quando houver desconto que exige autorização, o aviso informa a situação e PDF e efetivação ficam bloqueados até a liberação. Salve a proposta antes de solicitar autorização. A ação Autorizar desconto exige permissão específica; a gravação também está sujeita às regras da empresa.",
      },
      {
        titulo: "Salvar, emitir PDF e copiar",
        texto:
          "Salvar grava e mantém o formulário aberto; Cadastrar e fechar ou Salvar e fechar grava e retorna à listagem. Depois de salvo, o orçamento oferece PDF e a aba Aprovação e integração. Revise os campos indicados se a gravação for recusada. Orçamentos aprovados ou expirados não podem ser alterados: Copiar inicia uma nova proposta, retorna o status para rascunho e recalcula a validade conforme a configuração. Revise e salve a cópia para gerar o novo registro. Ao concluir, você terá uma proposta salva para acompanhamento e, quando permitido, emissão de PDF e aprovação.",
      },
      {
        titulo: "Rever o tour",
        texto:
          "Listagem, criação e edição possuem tours independentes, disponíveis pelo ícone da barra superior ou pelo menu da conta em telas pequenas. No formulário, o tour apresenta os campos e as abas visíveis sem alterar os dados. A criação pela cortina lateral da Posição do Cliente não inicia o tour do formulário.",
      },
    ],
  },
  {
    codigo: "inicio",
    rota: "/",
    titulo: "Tela inicial",
    resumo:
      "Entenda os atalhos, avisos e recursos disponíveis ao entrar na plataforma.",
    finalidade:
      "A tela inicial reúne os caminhos mais usados no trabalho diário e informações importantes da empresa. O conteúdo é personalizado conforme seu perfil, suas permissões e os recursos habilitados na empresa ativa.",
    secoes: [
      {
        titulo: "Acesso rápido",
        texto:
          "Os cartões levam diretamente às rotinas mais usadas. A lista é organizada para apoiar o fluxo comercial do dia a dia e mostra somente funções liberadas para seu perfil.",
        itens: [
          "Use Posição de Cliente para consultar carteira, compras e títulos.",
          "Use Orçamentos para acompanhar e preparar propostas comerciais.",
          "Use Agenda e Atividades para organizar compromissos e acompanhamentos.",
          "Use Produtos, Títulos a Receber e os dashboards para consultar informações comerciais.",
        ],
      },
      {
        titulo: "Menu e busca",
        texto:
          "O menu lateral apresenta os módulos e rotinas autorizados para você. A busca no topo encontra uma tela pelo nome sem exigir que você conheça sua posição no menu.",
      },
      {
        titulo: "Comunicados e aniversariantes",
        texto:
          "O mural exibe avisos vigentes destinados ao seu perfil. A área de aniversariantes mostra integrantes da equipe que fazem aniversário nos próximos dias.",
      },
      {
        titulo: "Empresa e conta",
        texto:
          "No menu da conta você consulta seu perfil, troca a empresa ativa quando possuir mais de um vínculo e encerra a sessão. Ao trocar de empresa, permissões e informações da tela também são atualizadas.",
      },
      {
        titulo: "Precisa rever a apresentação?",
        texto:
          "Use o ícone de Tour na barra superior para iniciar novamente a apresentação guiada desta tela. O ícone de ajuda sempre retorna a esta documentação.",
      },
    ],
  },
  {
    codigo: "dashboard-comercial",
    rota: "/comercial/dashboard",
    titulo: "Dashboard Comercial",
    resumo:
      "Acompanhe objetivos, vendas, clientes positivados, devoluções e cobertura da base.",
    finalidade:
      "O Dashboard Comercial compara metas e resultados do período dentro do escopo de vendedores e clientes permitido ao usuário. Ele apoia a leitura rápida do desempenho e a identificação de pontos que precisam de acompanhamento.",
    secoes: [
      {
        titulo: "Filtros da análise",
        texto:
          "Selecione mês, ano, vendedor e município e clique em Buscar. Os municípios disponíveis consideram as vendas do período e o vendedor selecionado.",
      },
      {
        titulo: "Indicadores",
        texto:
          "Os cartões apresentam valor vendido, clientes positivados, devoluções e cobertura da base. Os percentuais comparam o realizado com a meta ou o total correspondente.",
      },
      {
        titulo: "Objetivos e município",
        texto:
          "Ao filtrar um município, as vendas são restritas à cidade, mas o objetivo permanece sendo a meta mensal do vendedor, pois a meta não é cadastrada por município.",
      },
      {
        titulo: "Vendas por categoria",
        texto:
          "A tabela distribui o valor realizado pelas categorias vendidas e exibe o total do período selecionado.",
      },
    ],
  },
  {
    codigo: "posicao-cliente",
    rota: "/comercial/posicao-cliente",
    titulo: "Posição do Cliente",
    resumo:
      "Consulte a carteira, o ritmo de compras e os alertas financeiros dos clientes.",
    finalidade:
      "A Posição do Cliente organiza sinais comerciais e financeiros para ajudar a priorizar contatos, recuperar clientes sem compras recentes e acessar rapidamente as ações relacionadas a cada cadastro.",
    secoes: [
      {
        titulo: "Busca e filtros rápidos",
        texto:
          "Pesquise um cliente, alterne o status e use os atalhos de dias sem comprar para formar uma lista de acompanhamento.",
      },
      {
        titulo: "Filtros avançados",
        texto:
          "Combine UF, município, vendedor e vínculo de carteira. As opções respeitam sua hierarquia comercial e se ajustam aos filtros já escolhidos.",
      },
      {
        titulo: "Indicadores da listagem",
        texto:
          "Compare última compra, resultado dos últimos 30 dias, média de 90 dias, diferença do mês para a média, dias sem compra e comodato.",
      },
      {
        titulo: "Títulos em aberto",
        texto:
          "O cifrão vermelho indica título vencido, o azul indica vencimento em até sete dias e o verde indica título ainda não vencido. A situação mais urgente prevalece.",
      },
      {
        titulo: "Ações do cliente",
        texto:
          "Clique na linha para abrir a posição completa. O menu de ações pode oferecer cadastro, alteração, orçamento e conversa, conforme suas permissões.",
      },
    ],
  },
];

export function ajudaPorCodigo(codigo: string) {
  return AJUDAS_ROTINAS.find((ajuda) => ajuda.codigo === codigo);
}

export function ajudaPorRota(pathname: string) {
  if (pathname === "/assistente/ajuda") {
    return { codigo: "assistente", href: "/assistente/ajuda" };
  }
  const ajuda = AJUDAS_ROTINAS.find((item) =>
    item.modoRota !== "descendente" && item.rota === pathname,
  ) ?? AJUDAS_ROTINAS.find((item) =>
    item.rota !== "/" && item.modoRota !== "exata" && pathname.startsWith(`${item.rota}/`),
  );
  return ajuda
    ? { codigo: ajuda.codigo, href: `/ajuda/rotinas/${ajuda.codigo}` }
    : null;
}
