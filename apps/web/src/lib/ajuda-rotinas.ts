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
