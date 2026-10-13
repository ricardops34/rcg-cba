export interface ImagemAjuda {
  src: string;
  titulo: string;
  descricao: string;
}

export const IMAGENS_POR_ROTINA: Record<string, ImagemAjuda[]> = {
  inicio: [
    {
      src: "/imagens/ajuda/print_mural_atalhos.png",
      titulo: "Mural de Acesso Rápido e Boas-Vindas",
      descricao:
        "Atalhos para as rotinas mais usadas, avisos da empresa e lista de aniversariantes da equipe.",
    },
    {
      src: "/imagens/ajuda/print_notificacoes.png",
      titulo: "Central de Notificações e Alertas",
      descricao:
        "Alertas em tempo real de inadimplência, títulos vencidos e cálculos de sugestão de compra.",
    },
    {
      src: "/imagens/ajuda/print_meu_perfil.png",
      titulo: "Perfil do Usuário e Conexão WhatsApp",
      descricao:
        "Configuração de dados pessoais, foto corporativa, troca de senha e número de WhatsApp.",
    },
    {
      src: "/imagens/ajuda/print_login.png",
      titulo: "Tela de Autenticação Segura",
      descricao:
        "Acesso corporativo seguro com e-mail, senha e seleção da empresa ativa.",
    },
  ],

  "posicao-cliente": [
    {
      src: "/imagens/ajuda/print_posicao_cliente_lista.png",
      titulo: "Listagem da Carteira de Clientes",
      descricao:
        "Visão analítica com última compra, média de compras, dias sem comprar e indicadores financeiros.",
    },
    {
      src: "/imagens/ajuda/print_posicao_cliente_filtros.png",
      titulo: "Gaveta de Filtros Avançados",
      descricao:
        "Segmentação refinada por vendedor, município, UF e situação da carteira.",
    },
    {
      src: "/imagens/ajuda/print_posicao_cliente_detalhe.png",
      titulo: "Posição Analítica 360° do Cliente",
      descricao:
        "Ficha com histórico de notas fiscais, títulos em aberto, equipamentos em comodato e contatos.",
    },
    {
      src: "/imagens/ajuda/print_posicao_cliente_orcamentos.png",
      titulo: "Histórico de Orçamentos do Cliente",
      descricao:
        "Consulta rápida de todas as propostas comerciais e orçamentos vinculados ao cliente.",
    },
    {
      src: "/imagens/ajuda/print_cadastro_cliente.png",
      titulo: "Ficha Cadastral e Dados Fiscais",
      descricao:
        "Visualização de CNPJ, Inscrição Estadual, Razão Social, CNAE e tributação do cliente.",
    },
  ],

  orcamentos: [
    {
      src: "/imagens/ajuda/print_orcamentos_lista.png",
      titulo: "Painel de Acompanhamento de Orçamentos",
      descricao:
        "Listagem geral de propostas com status comercial, validade, vendedor e integração com o ERP.",
    },
    {
      src: "/imagens/ajuda/print_orcamentos_novo.png",
      titulo: "Preparação de Proposta Comercial",
      descricao:
        "Formulário para seleção de cliente, itens, mix de produtos, condições e desconto autorizado.",
    },
  ],

  produtos: [
    {
      src: "/imagens/ajuda/print_catalogo_produtos.png",
      titulo: "Catálogo de Produtos da Empresa",
      descricao:
        "Consulta ágil do portfólio, código ERP, categoria, preço de tabela e saldo em estoque.",
    },
  ],

  "produto-detalhe": [
    {
      src: "/imagens/ajuda/print_detalhe_produto.png",
      titulo: "Ficha Técnica e Tributária",
      descricao:
        "Detalhamento de regras fiscais, NCM, fotos complementares e unidades de conversão.",
    },
  ],

  "titulos-receber": [
    {
      src: "/imagens/ajuda/print_titulos_receber.png",
      titulo: "Controle de Títulos a Receber",
      descricao:
        "Gestão de duplicatas em aberto, vencimentos, saldos, status de pagamento e emissão de boletos.",
    },
  ],

  agenda: [
    {
      src: "/imagens/ajuda/print_agenda.png",
      titulo: "Calendário e Agenda Comercial",
      descricao:
        "Organização visual de compromissos, visitas a clientes e acompanhamentos da equipe.",
    },
  ],

  "meus-atendimentos": [
    {
      src: "/imagens/ajuda/print_meus_atendimentos.png",
      titulo: "Fila de Atendimentos do Vendedor",
      descricao:
        "Painel de conversas ativas, contatos prioritários e histórico recente de interações.",
    },
  ],

  atendimento: [
    {
      src: "/imagens/ajuda/print_whatsapp_chat_ao_vivo.png",
      titulo: "Chat ao Vivo com Contexto do Cliente",
      descricao:
        "Mensagens em tempo real com histórico do cliente, botões rápidos e integração comercial.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_widget_flutuante.png",
      titulo: "Widget Flutuante Multitarefa",
      descricao:
        "Acompanhe atendimentos em segundo plano sem sair da tela ou rotina em execução.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_acoes_rapidas.png",
      titulo: "Ações Comerciais Integradas",
      descricao:
        "Criação de orçamentos e vínculo de novos clientes direto da conversa de WhatsApp.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_conectado.png",
      titulo: "Painel de Conexão WhatsApp",
      descricao:
        "Status de conexão da linha oficial, número ativo e controles de sessão.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_qrcode.png",
      titulo: "Pareamento via QR Code",
      descricao:
        "Conexão segura pelo aplicativo WhatsApp no celular da empresa ou vendedor.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_desconectado.png",
      titulo: "Estado Desconectado",
      descricao:
        "Orientações e botão para inicializar uma nova sessão do WhatsApp institucional.",
    },
  ],

  "dashboard-comercial": [
    {
      src: "/imagens/ajuda/print_dashboard_comercial.png",
      titulo: "Dashboard Comercial Executivo",
      descricao:
        "Acompanhamento de metas do mês, vendas realizadas, clientes positivados e cobertura da base.",
    },
  ],

  "dashboard-gerencial": [
    {
      src: "/imagens/ajuda/print_dashboard_gerencial.png",
      titulo: "Dashboard Gerencial Consolidado",
      descricao:
        "Visão macro do faturamento da empresa, evolução de metas e desempenho comparativo da equipe.",
    },
  ],

  "consulta-evolucao": [
    {
      src: "/imagens/ajuda/print_evolucao_mensal.png",
      titulo: "Evolução Mensal de Faturamento",
      descricao:
        "Gráficos analíticos com histórico mês a mês e indicadores de sazonalidade comercial.",
    },
  ],

  "consulta-vendas-produto": [
    {
      src: "/imagens/ajuda/print_vendas_por_produto.png",
      titulo: "Ranking de Vendas por Produto",
      descricao:
        "Classificação dos itens mais vendidos por faturamento e volume total comercializado.",
    },
  ],

  "equipamentos-comodato": [
    {
      src: "/imagens/ajuda/print_comodatos_lista.png",
      titulo: "Parque de Equipamentos em Comodato",
      descricao:
        "Painel de acompanhamento de máquinas e purificadores comodatados e seus clientes vinculados.",
    },
    {
      src: "/imagens/ajuda/print_comodatos_produtos_aplicaveis.png",
      titulo: "Refis e Insumos Obrigatórios",
      descricao:
        "Cadastro de peças e consumíveis compatíveis que apoiam o cálculo de sugestão de compra.",
    },
  ],

  "equipamento-comodato-detalhe": [
    {
      src: "/imagens/ajuda/print_comodatos_produtos_aplicaveis.png",
      titulo: "Produtos Aplicáveis ao Equipamento",
      descricao:
        "Vínculo de refis e consumíveis compatíveis para sugestão automática em orçamentos.",
    },
  ],

  "gerencial-whatsapp": [
    {
      src: "/imagens/ajuda/print_whatsapp_chat_ao_vivo.png",
      titulo: "Auditoria e Histórico de Conversas",
      descricao:
        "Centralização de diálogos de WhatsApp de toda a equipe para conformidade e suporte comercial.",
    },
    {
      src: "/imagens/ajuda/print_whatsapp_conectado.png",
      titulo: "Status das Linhas da Equipe",
      descricao:
        "Monitoramento de números conectados e instâncias em operação pelos vendedores.",
    },
  ],
};

