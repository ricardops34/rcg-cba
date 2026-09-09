export interface SecaoAjuda {
  titulo: string;
  texto: string;
  itens?: string[];
}

export interface AjudaRotina {
  codigo: string;
  rota: string;
  titulo: string;
  resumo: string;
  finalidade: string;
  secoes: SecaoAjuda[];
}

export const AJUDAS_ROTINAS: AjudaRotina[] = [
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
    item.rota === "/"
      ? pathname === "/"
      : pathname === item.rota || pathname.startsWith(`${item.rota}/`),
  );
  return ajuda
    ? { codigo: ajuda.codigo, href: `/ajuda/rotinas/${ajuda.codigo}` }
    : null;
}
