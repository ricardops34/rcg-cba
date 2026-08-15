/**
 * Seed base — limpa os dados e popula uma base mínima:
 *   - 3 empresas: BJSoftware, RCG Distribuidora, CBA Distribuidora
 *   - 1 usuário Admin com acesso (perfil Administrador) às 3 empresas
 *
 * Idempotente: pode rodar várias vezes. LIMPA os dados de negócio/tenant antes
 * de popular (empresas, perfis, usuários, vínculos, produtos, refresh
 * tokens). A estrutura de menu/módulos/rotinas é reconstruída via upsert (as
 * permissões do Admin dependem das rotinas existirem).
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/seed-base.ts
 *
 * ATENÇÃO: apaga todos os dados de negócio do banco apontado por DATABASE_URL.
 * Use apenas em desenvolvimento ou numa base que pode ser recriada.
 */
import { Acao, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SENHA_ADMIN = 'Admin@123';

const ADMIN = {
  nome: 'Administrador',
  email: 'admin@bjsoft.com.br',
};

interface EmpresaSeed {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  alias: string;
}

// CNPJs são placeholders — troque pelos reais quando tiver.
const EMPRESAS: EmpresaSeed[] = [
  {
    razaoSocial: 'BJSoftware LTDA',
    nomeFantasia: 'BJSoftware',
    cnpj: '11222333000181',
    alias: 'bjs',
  },
  {
    razaoSocial: 'RCG Distribuidora LTDA',
    nomeFantasia: 'RCG Distribuidora',
    cnpj: '22333444000172',
    alias: 'rcg',
  },
  {
    razaoSocial: 'CBA Distribuidora LTDA',
    nomeFantasia: 'CBA Distribuidora',
    cnpj: '33444555000163',
    alias: 'cba',
  },
];

const ACOES: Acao[] = [
  'visualizar',
  'cadastrar',
  'editar',
  'excluir',
  'importar',
  'exportar',
  'aprovar',
  'cancelar',
  'bloquear',
];

// Perfil Vendedor: acesso à própria carteira de clientes (visualizar/cadastrar/
// editar) e consulta às demais telas comerciais. titulos-receber e notas-saida
// só têm rota de visualização na API (mirror read-only do ERP legado), então
// não faz sentido conceder outras ações a elas.
const VENDEDOR_PERMISSOES: Record<string, Acao[]> = {
  clientes: ['visualizar', 'cadastrar', 'editar'],
  'posicao-cliente': ['visualizar'],
  'titulos-receber': ['visualizar'],
  'notas-saida': ['visualizar'],
  produtos: ['visualizar'],
  'tabelas-preco': ['visualizar'],
  objetivos: ['visualizar'],
  'dashboard-comercial': ['visualizar'],
  // CRM: o vendedor administra o próprio funil/agenda, mas não exclui
  // registros (mesmo critério de clientes — só Admin/Diretor excluem).
  oportunidades: ['visualizar', 'cadastrar', 'editar'],
  atividades: ['visualizar', 'cadastrar', 'editar'],
  orcamentos: ['visualizar', 'cadastrar', 'editar'],
  // Agenda é só uma visão em calendário das próprias atividades — não tem
  // rotas/CRUD dela mesma, então só precisa de 'visualizar' (o cadastro/edição
  // passa pela permissão de 'atividades' de qualquer forma).
  agenda: ['visualizar'],
};

/**
 * Parâmetros que toda empresa nasce tendo (Administração > Parâmetros). Os
 * mesmos da migration 20260810184018_parametros_empresa — quem lê cada um
 * está no service correspondente (ex.: ORCAMENTO_DIAS_VALIDADE em
 * OrcamentoConfigService). O admin pode criar outros pela tela.
 */
const PARAMETROS_PADRAO = [
  {
    parametro: 'ORCAMENTO_DIAS_VALIDADE',
    tipo: 'numero' as const,
    tamanho: 3,
    conteudo: '30',
    descricao: 'Dias somados à emissão para sugerir a validade do orçamento',
  },
  {
    parametro: 'DESCONTO_ACIMA_LIMITE_BLOQUEIA',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'false',
    descricao:
      'Recusa a gravação do orçamento com desconto acima do limite da regra; falso apenas avisa na tela',
  },
  {
    parametro: 'CONSULTA_VENDAS_BASE_VENDEDOR',
    tipo: 'texto' as const,
    tamanho: 10,
    conteudo: 'nota',
    descricao:
      'Vendedor considerado nas Consultas de venda: nota (quem vendeu) ou cliente (titular da carteira)',
  },
  {
    parametro: 'COMISSAO_OCULTA_PARA_TODOS',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'false',
    descricao:
      'Esconde os valores de comissão de todos os perfis, ignorando a permissão comissao.visualizar',
  },
  {
    parametro: 'SMTP_HOST',
    tipo: 'texto' as const,
    tamanho: 120,
    conteudo: null,
    descricao: 'Servidor de e-mail; vazio usa a configuração do servidor',
  },
  {
    parametro: 'SMTP_PORTA',
    tipo: 'numero' as const,
    tamanho: 5,
    conteudo: null,
    descricao: 'Porta do servidor de e-mail (ex.: 587)',
  },
  {
    parametro: 'SMTP_SEGURO',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'false',
    descricao: 'Conexão SSL/TLS direta com o servidor de e-mail',
  },
  {
    parametro: 'SMTP_USUARIO',
    tipo: 'texto' as const,
    tamanho: 120,
    conteudo: null,
    descricao: 'Usuário de autenticação no servidor de e-mail',
  },
  {
    parametro: 'SMTP_SENHA',
    tipo: 'senha' as const,
    tamanho: 120,
    conteudo: null,
    descricao: 'Senha de autenticação no servidor de e-mail',
  },
  {
    parametro: 'SMTP_REMETENTE',
    tipo: 'texto' as const,
    tamanho: 150,
    conteudo: null,
    descricao: 'Endereço exibido como remetente dos e-mails',
  },
];

// Rotinas de administração do sistema — o perfil Diretor tem acesso irrestrito
// aos dados comerciais, mas não a estas (ver bootstrapPerfilDiretor).
const ROTINAS_ADMIN_ONLY = new Set([
  'empresas',
  'usuarios',
  'perfis',
  'politica-senha',
  'menus',
  'modulos',
  'rotinas',
  // Gestão de chaves da API de integração ERP: capacidade de segurança/
  // sistema, não dado comercial — fora do "acesso irrestrito" do Diretor.
  'integracao',
  // Define quais campos do cadastro de Cliente podem ser alterados: config
  // de sistema, não dado comercial.
  'clientes-config',
  // Define os dias de validade padrão do Orçamento: config de sistema, não
  // dado comercial.
  'orcamento-config',
  // Parâmetros do sistema por empresa: config, não dado comercial.
  'parametros',
  // Auditoria de acesso (quem entrou, quando, tentativas sem sucesso):
  // segurança/sistema, não dado comercial.
  'acessos',
]);

async function limparDados() {
  // Ordem respeita as FKs. usuarioEmpresa e vendedor têm auto-referência
  // (superiorId; supervisorId/gerenteId): zera antes de apagar para não
  // violar a constraint.
  // Filhas de Cliente e resultados derivados: apagadas antes de `cliente` e de
  // `produto`, que elas referenciam.
  await prisma.sugestaoCompraGerada.deleteMany();
  await prisma.clienteHistorico.deleteMany();
  await prisma.clienteAlteracao.deleteMany();
  await prisma.clienteCnae.deleteMany();
  // Conversas do agente e a configuração dele (referenciam empresa).
  await prisma.agenteMensagem.deleteMany();
  await prisma.agenteConversa.deleteMany();
  await prisma.agenteConfig.deleteMany();
  await prisma.notaSaidaItem.deleteMany();
  await prisma.notaSaida.deleteMany();
  await prisma.tituloReceber.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.tabelaPrecoItem.deleteMany();
  await prisma.tabelaPreco.deleteMany();
  await prisma.objetivoVendedorCategoria.deleteMany();
  await prisma.objetivoVendedorMes.deleteMany();
  await prisma.atividade.deleteMany();
  await prisma.orcamentoItem.deleteMany();
  await prisma.orcamento.deleteMany();
  await prisma.oportunidade.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.vendedor.updateMany({
    data: { supervisorId: null, gerenteId: null },
  });
  await prisma.vendedor.deleteMany();
  await prisma.produto.deleteMany();
  // Depois de produtos e itens, que apontam para a regra.
  await prisma.regraDescontoFaixa.deleteMany();
  await prisma.regraDesconto.deleteMany();
  // Auxiliares por empresa (categoria tem auto-referência categoriaPaiId).
  // Os auxiliares globais (estados, municípios, ceps, países, cnaes) não são
  // limpos: não referenciam empresa e sobrevivem ao re-seed, como menus.
  await prisma.categoria.updateMany({ data: { categoriaPaiId: null } });
  await prisma.categoria.deleteMany();
  await prisma.condicaoPagamento.deleteMany();
  await prisma.armazem.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.senhaHistorico.deleteMany();
  // Auditoria de acesso e horário de trabalho referenciam `usuarios` — sem
  // limpar aqui, o `usuario.deleteMany()` lá embaixo viola
  // `sessoes_usuarioId_fkey` e o seed morre no MEIO da limpeza, deixando a
  // base sem perfis, sem vínculos e sem dado de negócio.
  await prisma.refreshToken.deleteMany({ where: { sessaoId: { not: null } } });
  await prisma.sessao.deleteMany();
  await prisma.acessoLog.deleteMany();
  await prisma.usuarioHorario.deleteMany();
  await prisma.usuarioEmpresa.updateMany({ data: { superiorId: null } });
  await prisma.usuarioEmpresa.deleteMany();
  await prisma.perfilPermissao.deleteMany();
  await prisma.perfil.deleteMany();
  // Limpeza pontual: "Itens de NF de Saída" foi unificado dentro do
  // mestre-detalhe de Notas de Saída — remove a rotina/menu órfãos de bases
  // já seedadas (bootstrapMenu só faz upsert, não apaga o que saiu da lista).
  await prisma.rotina.deleteMany({ where: { codigo: 'itens-nota-saida' } });
  await prisma.menu.deleteMany({ where: { id: 'seed-menu-itens-nota-saida' } });
  await prisma.usuario.deleteMany();
  await prisma.clienteCampoConfig.deleteMany();
  await prisma.orcamentoConfig.deleteMany();
  await prisma.parametroEmpresa.deleteMany();
  // Chaves da API de integração também apontam para empresa.
  await prisma.integracaoApiKey.deleteMany();
  await prisma.empresa.deleteMany();
}

async function bootstrapMenu() {
  const moduloAdministracao = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-administracao' },
    create: {
      id: 'seed-modulo-administracao',
      nome: 'Administração',
      icone: 'settings',
      ordem: 1,
    },
    update: { nome: 'Administração', icone: 'settings', ordem: 1 },
  });
  const moduloComercial = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-comercial' },
    create: {
      id: 'seed-modulo-comercial',
      nome: 'Comercial',
      icone: 'briefcase',
      ordem: 2,
    },
    update: { nome: 'Comercial', icone: 'briefcase', ordem: 2 },
  });
  const moduloCrm = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-crm' },
    create: {
      id: 'seed-modulo-crm',
      nome: 'CRM',
      icone: 'handshake',
      ordem: 3,
    },
    update: { nome: 'CRM', icone: 'handshake', ordem: 3 },
  });
  const moduloGerencial = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-gerencial' },
    create: {
      id: 'seed-modulo-gerencial',
      nome: 'Gerencial',
      icone: 'users-round',
      ordem: 4,
    },
    update: { nome: 'Gerencial', icone: 'users-round', ordem: 4 },
  });
  const moduloCadastros = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-cadastros' },
    create: {
      id: 'seed-modulo-cadastros',
      nome: 'Cadastros',
      icone: 'database',
      ordem: 5,
    },
    update: { nome: 'Cadastros', icone: 'database', ordem: 5 },
  });
  const moduloConsultas = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-consultas' },
    create: {
      id: 'seed-modulo-consultas',
      nome: 'Consultas',
      icone: 'chart-column',
      ordem: 4,
    },
    update: { nome: 'Consultas', icone: 'chart-column', ordem: 4 },
  });

  const menuDefs = [
    {
      id: 'seed-menu-empresas',
      nome: 'Empresas',
      rota: '/admin/empresas',
      icone: 'building',
      codigo: 'empresas',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-usuarios',
      nome: 'Usuários',
      rota: '/admin/usuarios',
      icone: 'users',
      codigo: 'usuarios',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-perfis',
      nome: 'Perfis',
      rota: '/admin/perfis',
      icone: 'shield',
      codigo: 'perfis',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-politica-senha',
      nome: 'Política de Senha',
      rota: '/admin/politica-senha',
      icone: 'lock',
      codigo: 'politica-senha',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-estrutura',
      nome: 'Estrutura de Menu',
      rota: '/admin/estrutura',
      icone: 'layout-grid',
      codigo: 'menus',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-integracao',
      nome: 'Integração',
      rota: '/admin/integracao',
      icone: 'plug',
      codigo: 'integracao',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-clientes-config',
      nome: 'Campos do Cliente',
      rota: '/admin/clientes-config',
      icone: 'list-checks',
      codigo: 'clientes-config',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-parametros',
      nome: 'Parâmetros',
      rota: '/admin/parametros',
      icone: 'sliders-horizontal',
      codigo: 'parametros',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-orcamento-config',
      nome: 'Validade de Orçamento',
      rota: '/admin/orcamento-config',
      icone: 'calendar-clock',
      codigo: 'orcamento-config',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-acessos',
      nome: 'Acessos',
      rota: '/admin/acessos',
      icone: 'history',
      codigo: 'acessos',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-dashboard-comercial',
      nome: 'Dashboard',
      rota: '/comercial/dashboard',
      icone: 'gauge',
      codigo: 'dashboard-comercial',
      moduloId: moduloComercial.id,
    },
    {
      id: 'seed-menu-produtos',
      nome: 'Produtos',
      rota: '/comercial/produtos',
      icone: 'package',
      codigo: 'produtos',
      moduloId: moduloComercial.id,
    },
    {
      id: 'seed-menu-clientes',
      nome: 'Clientes',
      rota: '/cadastros/clientes',
      icone: 'users',
      codigo: 'clientes',
      // Cadastro de Clientes mora em Cadastros (junto de Tabelas de Preço,
      // Condições de Pagamento etc.), não em Comercial, que é operação.
      moduloId: moduloCadastros.id,
    },
    // Fila de aprovação do cadastro: rotina própria porque aprovar é papel
    // distinto de editar (a permissão que decide se a edição grava ou entra na
    // fila é `clientes.aprovar`).
    {
      id: 'seed-menu-clientes-alteracoes',
      nome: 'Alterações de Cliente',
      rota: '/cadastros/clientes-alteracoes',
      icone: 'file-clock',
      codigo: 'clientes-alteracoes',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-posicao-cliente',
      nome: 'Posição de Cliente',
      rota: '/comercial/posicao-cliente',
      icone: 'user-search',
      codigo: 'posicao-cliente',
      moduloId: moduloComercial.id,
    },
    {
      id: 'seed-menu-estoque',
      nome: 'Estoque',
      rota: '/comercial/estoque',
      icone: 'boxes',
      codigo: 'estoque',
      moduloId: moduloComercial.id,
    },
    // Notas de Saída é um cadastro mestre-detalhe: os itens vêm embutidos no
    // detalhe da nota (GET /notas-saida/:id), sem menu/rotina própria.
    {
      id: 'seed-menu-notas-saida',
      nome: 'Notas de Saída',
      rota: '/comercial/notas-saida',
      icone: 'file-text',
      codigo: 'notas-saida',
      moduloId: moduloComercial.id,
    },
    {
      id: 'seed-menu-titulos-receber',
      nome: 'Títulos a Receber',
      rota: '/comercial/titulos-receber',
      icone: 'receipt',
      codigo: 'titulos-receber',
      moduloId: moduloComercial.id,
    },
    // Atendimento por WhatsApp: a tela de conversa do vendedor. A conexão do
    // aparelho é um botão dentro desta própria tela — é o vendedor que conecta
    // o WhatsApp dele, e um menu separado só para parear seria um item a mais
    // para ele nunca encontrar. O que é decisão da empresa (transporte,
    // retenção) fica no módulo Configurações.
    //
    // As ações da rotina, para o RBAC:
    //   visualizar → ver as próprias conversas
    //   cadastrar  → enviar mensagem
    //   editar     → conectar/desconectar o aparelho e vincular contato a cliente
    {
      id: 'seed-menu-whatsapp',
      nome: 'Atendimento',
      rota: '/comercial/atendimento',
      icone: 'message-circle',
      codigo: 'whatsapp-conversas',
      moduloId: moduloComercial.id,
    },
    {
      id: 'seed-menu-configuracoes-whatsapp',
      nome: 'WhatsApp',
      rota: '/admin/whatsapp',
      icone: 'message-circle',
      codigo: 'whatsapp-config',
      moduloId: moduloAdministracao.id,
    },
    {
      id: 'seed-menu-oportunidades',
      nome: 'Oportunidades',
      rota: '/crm/oportunidades',
      icone: 'trending-up',
      codigo: 'oportunidades',
      moduloId: moduloCrm.id,
    },
    {
      id: 'seed-menu-atividades',
      nome: 'Atividades',
      rota: '/crm/atividades',
      icone: 'list-checks',
      codigo: 'atividades',
      moduloId: moduloCrm.id,
    },
    {
      id: 'seed-menu-agenda',
      nome: 'Agenda',
      rota: '/crm/agenda',
      icone: 'calendar-days',
      codigo: 'agenda',
      moduloId: moduloCrm.id,
    },
    {
      id: 'seed-menu-orcamentos',
      nome: 'Orçamentos',
      rota: '/crm/orcamentos',
      icone: 'clipboard-list',
      codigo: 'orcamentos',
      moduloId: moduloCrm.id,
    },
    {
      id: 'seed-menu-vendedores',
      nome: 'Vendedores',
      rota: '/gerencial/vendedores',
      icone: 'user-round',
      codigo: 'vendedores',
      moduloId: moduloGerencial.id,
    },
    {
      id: 'seed-menu-objetivos',
      nome: 'Objetivos',
      rota: '/gerencial/objetivos',
      icone: 'target',
      codigo: 'objetivos',
      moduloId: moduloGerencial.id,
    },
    {
      id: 'seed-menu-categorias',
      nome: 'Categorias',
      rota: '/cadastros/categorias',
      icone: 'tags',
      codigo: 'categorias',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-condicoes-pagamento',
      nome: 'Condições de Pagamento',
      rota: '/cadastros/condicoes-pagamento',
      icone: 'credit-card',
      codigo: 'condicoes-pagamento',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-armazens',
      nome: 'Armazéns',
      rota: '/cadastros/armazens',
      icone: 'warehouse',
      codigo: 'armazens',
      moduloId: moduloCadastros.id,
    },
    // Itens da tabela de preço vêm embutidos no detalhe (GET /tabelas-preco/:id/itens), sem menu/rotina própria — mesmo racional de Notas de Saída.
    {
      id: 'seed-menu-tabelas-preco',
      nome: 'Tabelas de Preço',
      rota: '/cadastros/tabelas-preco',
      icone: 'tag',
      codigo: 'tabelas-preco',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-estados',
      nome: 'Estados',
      rota: '/cadastros/estados',
      icone: 'map',
      codigo: 'estados',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-municipios',
      nome: 'Municípios',
      rota: '/cadastros/municipios',
      icone: 'map-pin',
      codigo: 'municipios',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-ceps',
      nome: 'CEPs',
      rota: '/cadastros/ceps',
      icone: 'map-pinned',
      codigo: 'ceps',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-paises',
      nome: 'Países',
      rota: '/cadastros/paises',
      icone: 'globe',
      codigo: 'paises',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-cnaes',
      nome: 'CNAEs',
      rota: '/cadastros/cnaes',
      icone: 'file-badge',
      codigo: 'cnaes',
      moduloId: moduloCadastros.id,
    },
    {
      id: 'seed-menu-regras-desconto',
      nome: 'Regras de Desconto',
      rota: '/cadastros/regras-desconto',
      icone: 'percent',
      codigo: 'regras-desconto',
      moduloId: moduloCadastros.id,
    },
    // Consultas gerenciais: uma rotina por tela, para que a permissão de
    // exportar possa ser dada em uma e não na outra.
    {
      id: 'seed-menu-consulta-vendas-cliente',
      nome: 'Vendas por Cliente',
      rota: '/consultas/vendas-cliente',
      icone: 'users-round',
      codigo: 'consulta-vendas-cliente',
      moduloId: moduloConsultas.id,
    },
    {
      id: 'seed-menu-consulta-vendas-produto',
      nome: 'Vendas por Produto',
      rota: '/consultas/vendas-produto',
      icone: 'package-search',
      codigo: 'consulta-vendas-produto',
      moduloId: moduloConsultas.id,
    },
    {
      id: 'seed-menu-consulta-vendas-vendedor',
      nome: 'Vendas por Vendedor',
      rota: '/consultas/vendas-vendedor',
      icone: 'user-round',
      codigo: 'consulta-vendas-vendedor',
      moduloId: moduloConsultas.id,
    },
    {
      id: 'seed-menu-dashboard-gerencial',
      nome: 'Dashboard Gerencial',
      rota: '/gerencial/dashboard',
      icone: 'gauge',
      codigo: 'dashboard-gerencial',
      moduloId: moduloGerencial.id,
    },
    {
      id: 'seed-menu-consulta-evolucao',
      nome: 'Evolução Mensal',
      rota: '/consultas/evolucao',
      icone: 'trending-up',
      codigo: 'consulta-evolucao',
      moduloId: moduloConsultas.id,
    },
  ];

  for (const [i, m] of menuDefs.entries()) {
    const menu = await prisma.menu.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        moduloId: m.moduloId,
        nome: m.nome,
        rota: m.rota,
        icone: m.icone,
        ordem: i + 1,
      },
      update: {
        moduloId: m.moduloId,
        nome: m.nome,
        rota: m.rota,
        icone: m.icone,
      },
    });
    await prisma.rotina.upsert({
      where: { codigo: m.codigo },
      create: {
        id: `seed-rotina-${m.codigo}`,
        menuId: menu.id,
        nome: m.nome,
        codigo: m.codigo,
      },
      update: {},
    });
  }

  for (const codigo of ['modulos', 'rotinas']) {
    await prisma.rotina.upsert({
      where: { codigo },
      create: {
        id: `seed-rotina-${codigo}`,
        menuId: 'seed-menu-estrutura',
        nome: codigo === 'modulos' ? 'Módulos' : 'Rotinas',
        codigo,
      },
      update: {},
    });
  }

  // Rotina sem tela própria: controla quem enxerga os valores de comissão nos
  // itens de orçamento e de nota de saída. Fica sob o menu de Orçamentos, que
  // é onde a comissão aparece primeiro, e é configurada como qualquer outra
  // permissão na tela de Perfis.
  await prisma.rotina.upsert({
    where: { codigo: 'comissao' },
    create: {
      id: 'seed-rotina-comissao',
      menuId: 'seed-menu-orcamentos',
      nome: 'Comissão (valores)',
      codigo: 'comissao',
    },
    update: {},
  });

  // Rotina sem tela própria: ler a conversa de WhatsApp **de outro vendedor**.
  // Separada de `whatsapp-conversas` (que é "as minhas") de propósito — ler o
  // atendimento alheio é uma concessão consciente, não um efeito colateral de
  // dar acesso à tela. Ver privacidade em docs/planos/whatsapp-vendedor.md.
  await prisma.rotina.upsert({
    where: { codigo: 'whatsapp-equipe' },
    create: {
      id: 'seed-rotina-whatsapp-equipe',
      menuId: 'seed-menu-whatsapp',
      nome: 'WhatsApp da equipe',
      codigo: 'whatsapp-equipe',
    },
    update: {},
  });

  return prisma.rotina.findMany({ where: { deletedAt: null } });
}

// Garante a linha singleton de PoliticaSenha (também é criada sob demanda,
// via upsert lazy, por PoliticaSenhaService.getVigente() — replicado aqui só
// por completude do estado esperado em dev).
async function bootstrapPoliticaSenha() {
  await prisma.politicaSenha.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
}

// Perfil é global (ver migration perfil_global) — Administrador e Vendedor
// são criados uma única vez, compartilhados por todas as empresas.
async function bootstrapPerfis(rotinas: { id: string; codigo: string }[]) {
  // Administrador: acesso total (todas as ações em todas as rotinas).
  // sistemaBase = perfil protegido/base do sistema.
  const perfilAdmin = await prisma.perfil.create({
    data: {
      nome: 'Administrador',
      descricao: 'Perfil com acesso total ao sistema',
      sistemaBase: true,
    },
  });
  await prisma.perfilPermissao.createMany({
    data: rotinas.flatMap((rotina) =>
      ACOES.map((acao) => ({
        perfilId: perfilAdmin.id,
        rotinaId: rotina.id,
        acao,
        permitido: true,
      })),
    ),
    skipDuplicates: true,
  });

  // Vendedor: acesso à carteira de clientes + consultas comerciais (ver
  // VENDEDOR_PERMISSOES).
  const perfilVendedor = await prisma.perfil.create({
    data: {
      nome: 'Vendedor',
      descricao: 'Acesso à carteira de clientes e consultas comerciais',
      sistemaBase: false,
    },
  });
  await prisma.perfilPermissao.createMany({
    data: rotinas
      .filter((rotina) => rotina.codigo in VENDEDOR_PERMISSOES)
      .flatMap((rotina) =>
        VENDEDOR_PERMISSOES[rotina.codigo].map((acao) => ({
          perfilId: perfilVendedor.id,
          rotinaId: rotina.id,
          acao,
          permitido: true,
        })),
      ),
    skipDuplicates: true,
  });

  // Supervisor e Gerente: as mesmas telas do Vendedor (VENDEDOR_PERMISSOES).
  // O que muda entre eles não é o RBAC, e sim o alcance da carteira, que vem
  // do cadastro de Vendedor (flags supervisor/gerente + supervisorId/
  // gerenteId) e é resolvido por resolverEscopoVendedores — por isso os três
  // perfis compartilham a mesma lista de permissões.
  for (const [nome, descricao] of [
    ['Supervisor', 'Mesmas telas do Vendedor; a carteira alcançada vem da hierarquia do cadastro de Vendedores'],
    ['Gerente', 'Mesmas telas do Vendedor; a carteira alcançada vem da hierarquia do cadastro de Vendedores'],
  ]) {
    const perfil = await prisma.perfil.create({
      data: { nome, descricao, sistemaBase: false },
    });
    await prisma.perfilPermissao.createMany({
      data: rotinas
        .filter((rotina) => rotina.codigo in VENDEDOR_PERMISSOES)
        .flatMap((rotina) =>
          VENDEDOR_PERMISSOES[rotina.codigo].map((acao) => ({
            perfilId: perfil.id,
            rotinaId: rotina.id,
            acao,
            permitido: true,
          })),
        ),
      skipDuplicates: true,
    });
  }

  return { perfilAdmin, perfilVendedor };
}

/**
 * Diretor: acesso irrestrito aos dados comerciais, mas sem as telas de
 * administração do sistema (Usuários/Perfis/Empresas/Política de Senha/
 * Estrutura de Menu). Importante: NÃO usa sistemaBase=true — isso ligaria
 * `isAdmin` no JWT, e `PermissionsGuard` bypassa toda checagem de permissão
 * pra isAdmin=true (inclusive as rotinas de administração). Em vez disso,
 * Diretor recebe permissão explícita em tudo exceto ROTINAS_ADMIN_ONLY; o
 * acesso irrestrito aos *dados* (escopo de vendedor) vem de
 * resolverEscopoVendedores retornar null quando o usuário não tem nenhum
 * Vendedor vinculado — por isso um usuário Diretor nunca deve ganhar um
 * registro de Vendedor.
 */
async function bootstrapPerfilDiretor(rotinas: { id: string; codigo: string }[]) {
  const perfilDiretor = await prisma.perfil.create({
    data: {
      nome: 'Diretor',
      descricao: 'Acesso irrestrito aos dados comerciais, sem administração do sistema',
      sistemaBase: false,
    },
  });
  await prisma.perfilPermissao.createMany({
    data: rotinas
      .filter((rotina) => !ROTINAS_ADMIN_ONLY.has(rotina.codigo))
      .flatMap((rotina) =>
        ACOES.map((acao) => ({
          perfilId: perfilDiretor.id,
          rotinaId: rotina.id,
          acao,
          permitido: true,
        })),
      ),
    skipDuplicates: true,
  });
  return perfilDiretor;
}

async function main() {
  console.log('Limpando dados existentes...');
  await limparDados();

  console.log('Reconstruindo estrutura de menu/rotinas...');
  const rotinas = await bootstrapMenu();
  await bootstrapPoliticaSenha();
  const { perfilAdmin } = await bootstrapPerfis(rotinas);
  await bootstrapPerfilDiretor(rotinas);

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 12);

  // Um único usuário Admin, vinculado como Administrador nas 3 empresas.
  const admin = await prisma.usuario.create({
    data: {
      nome: ADMIN.nome,
      email: ADMIN.email,
      senhaHash,
      ativo: true,
      senhaAlteradaEm: new Date(),
    },
  });

  for (const cfg of EMPRESAS) {
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: cfg.razaoSocial,
        nomeFantasia: cfg.nomeFantasia,
        cnpj: cfg.cnpj,
        alias: cfg.alias,
        ativo: true,
      },
    });

    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: admin.id,
        empresaId: empresa.id,
        perfilId: perfilAdmin.id,
        ativo: true,
      },
    });

    await prisma.parametroEmpresa.createMany({
      data: PARAMETROS_PADRAO.map((p) => ({ ...p, empresaId: empresa.id })),
      skipDuplicates: true,
    });

    console.log(`— ${cfg.nomeFantasia}  (alias: ${cfg.alias})`);
  }

  console.log('\nSeed base concluído.');
  console.log(`Admin: ${ADMIN.email}`);
  console.log(`Senha: ${SENHA_ADMIN}`);
  console.log(`Empresas: ${EMPRESAS.map((e) => e.alias).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
