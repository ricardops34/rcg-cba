export const INICIO_TOUR_CODIGO = "inicio";
export const INICIO_TOUR_VERSAO = 1;

export interface TourPasso {
  seletor?: string;
  titulo: string;
  descricao: string;
}

export const INICIO_TOUR_PASSOS: TourPasso[] = [
  {
    titulo: "Bem-vindo à Plataforma Comercial",
    descricao:
      "Em poucos passos, você vai conhecer os recursos que organizam sua rotina e ajudam a acompanhar clientes, vendas e tarefas.",
  },
  {
    seletor: '[data-tour="menu-lateral"]',
    titulo: "Menu de rotinas",
    descricao:
      "Aqui ficam os módulos e rotinas liberados para o seu perfil. O conteúdo pode variar conforme suas permissões.",
  },
  {
    seletor: '[data-tour="alternar-menu"]',
    titulo: "Mais espaço para trabalhar",
    descricao:
      "Use este botão para expandir ou recolher o menu. No celular, ele abre a navegação lateral.",
  },
  {
    seletor: '[data-tour="busca-global"]',
    titulo: "Busca global",
    descricao:
      "Encontre rapidamente uma rotina pelo nome, sem precisar percorrer os módulos do menu.",
  },
  {
    seletor: '[data-tour="acesso-rapido"]',
    titulo: "Acesso rápido",
    descricao:
      "Reúne as rotinas mais usadas no dia a dia. Os cartões respeitam seu perfil de acesso e as funções habilitadas pela empresa.",
  },
  {
    seletor: '[data-tour="comunicados"]',
    titulo: "Comunicados",
    descricao:
      "Avisos importantes da empresa aparecem aqui. Itens fixados ganham destaque para não passarem despercebidos.",
  },
  {
    seletor: '[data-tour="aniversariantes"]',
    titulo: "Aniversariantes",
    descricao:
      "Veja os aniversários dos próximos 30 dias e mantenha o relacionamento com clientes e equipe mais próximo.",
  },
  {
    seletor: '[data-tour="notificacoes"]',
    titulo: "Notificações",
    descricao:
      "Pendências e acontecimentos que exigem sua atenção ficam concentrados neste sino.",
  },
  {
    seletor: '[data-tour="assistente"]',
    titulo: "Assistente",
    descricao:
      "Abra o assistente para tirar dúvidas e consultar informações com mais agilidade, conforme os recursos liberados para você.",
  },
  {
    seletor: '[data-tour="ajuda"]',
    titulo: "Ajuda da rotina",
    descricao:
      "Este atalho abre a explicação detalhada da tela atual. Você também pode reiniciar este tour pelo ícone de reprodução ao lado.",
  },
  {
    seletor: '[data-tour="tema"]',
    titulo: "Aparência",
    descricao:
      "Alterne entre os temas claro e escuro. O tour acompanha automaticamente a identidade visual escolhida.",
  },
  {
    seletor: '[data-tour="conta"]',
    titulo: "Conta e empresa ativa",
    descricao:
      "Acesse seu perfil, alterne entre empresas vinculadas e encerre a sessão. Cada empresa guarda seu próprio progresso do tour.",
  },
];
