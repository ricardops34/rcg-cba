import type { PrismaClient } from '@prisma/client';

/**
 * A estrutura de navegação e de permissão do sistema, em um lugar só.
 *
 * ## Por que este arquivo existe
 *
 * Isto vivia duas vezes: nos arrays do `seed-base.ts` (que monta uma base do
 * zero) e espalhado em `INSERT` de 17 migrations (que é o que chega numa base
 * já em produção, porque o seed é destrutivo e nunca roda contra dado real).
 * Duas listas do mesmo fato divergem — e divergiram, três vezes, encontradas na
 * auditoria de 2026-08-25:
 *
 * 1. `agente`, `agente-config` e `sugestao-compra` nasceram em migration e nunca
 *    entraram no seed: base nova subia sem o assistente.
 * 2. As permissões que a migration `perm_agente_equipe_comercial` concedeu ao
 *    comercial não estavam no seed — e como o seed **apaga** todas as permissões
 *    antes de recriá-las, rodá-lo apagava o agente da equipe.
 * 3. O perfil Diretor era montado por uma lista de negação escrita à mão, então
 *    rotina de Administração nova nascia **liberada** para ele. Quatro já haviam
 *    escapado, entre elas a tela que guarda a chave da API de IA.
 *
 * Agora há uma definição só. Quem a aplica são dois chamadores:
 *
 * - `seed-base.ts`, ao criar uma base do zero;
 * - `sincronizar-catalogo.ts`, rodado com a role dona contra uma base que já
 *   existe (ver docs/runbook-operacao.md).
 *
 * ## O que **não** entra aqui
 *
 * Permissão já concedida a um perfil é **configuração do cliente**, não catálogo
 * do software: o administrador pode ter desmarcado algo de propósito. Por isso o
 * sincronizador nunca mexe em `perfil_permissoes` — as listas abaixo valem na
 * **criação** dos perfis (seed), e conceder algo a uma base existente continua
 * sendo trabalho de uma migration explícita, escrita para aquela decisão.
 *
 * A exceção é o Diretor, e ela é de segurança: ver `sincronizarEstrutura`.
 */

/** Módulos: o primeiro nível do menu lateral. */
export const MODULO = {
  administracao: 'seed-modulo-administracao',
  comercial: 'seed-modulo-comercial',
  crm: 'seed-modulo-crm',
  gerencial: 'seed-modulo-gerencial',
  cadastros: 'seed-modulo-cadastros',
  consultas: 'seed-modulo-consultas',
} as const;

export const MODULOS = [
  { id: MODULO.administracao, nome: 'Administração', icone: 'settings', ordem: 1 },
  { id: MODULO.comercial, nome: 'Comercial', icone: 'briefcase', ordem: 2 },
  { id: MODULO.crm, nome: 'CRM', icone: 'handshake', ordem: 3 },
  { id: MODULO.gerencial, nome: 'Gerencial', icone: 'users-round', ordem: 4 },
  { id: MODULO.consultas, nome: 'Consultas', icone: 'chart-column', ordem: 4 },
  { id: MODULO.cadastros, nome: 'Cadastros', icone: 'database', ordem: 5 },
];

/**
 * Menu com tela própria. Cada um gera **uma** rotina, de mesmo nome, cujo
 * `codigo` é o que o `@RequirePermission` do controller exige.
 */
export interface DefinicaoMenu {
  id: string;
  nome: string;
  rota?: string;
  icone?: string;
  codigo: string;
  moduloId: string;
  disponivelTelaPequena?: boolean;
}

export const MENUS: DefinicaoMenu[] = [
  {
    id: 'seed-menu-empresas',
    nome: 'Empresas',
    rota: '/admin/empresas',
    icone: 'building',
    codigo: 'empresas',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-usuarios',
    nome: 'Usuários',
    rota: '/admin/usuarios',
    icone: 'users',
    codigo: 'usuarios',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-perfis',
    nome: 'Perfis',
    rota: '/admin/perfis',
    icone: 'shield',
    codigo: 'perfis',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-estrutura',
    nome: 'Estrutura de Menu',
    rota: '/admin/estrutura',
    icone: 'layout-grid',
    // Uma rotina só para a tela inteira. Eram três (`modulos`, `menus`,
    // `rotinas`) para um único controller e uma única tela — três linhas na
    // tela de Perfis, multiplicadas por nove ações, para uma decisão só.
    codigo: 'estrutura',
    moduloId: MODULO.administracao,
    disponivelTelaPequena: false,
  },
  {
    id: 'seed-menu-integracao',
    nome: 'Integração',
    rota: '/admin/integracao',
    icone: 'plug',
    codigo: 'integracao',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-clientes-config',
    nome: 'Campos do Cliente',
    rota: '/admin/clientes-config',
    icone: 'list-checks',
    codigo: 'clientes-config',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-parametros',
    nome: 'Parâmetros',
    rota: '/admin/parametros',
    icone: 'sliders-horizontal',
    codigo: 'parametros',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-acessos',
    nome: 'Acessos',
    rota: '/admin/acessos',
    icone: 'history',
    codigo: 'acessos',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-dashboard-comercial',
    nome: 'Dashboard',
    rota: '/comercial/dashboard',
    icone: 'gauge',
    codigo: 'dashboard-comercial',
    moduloId: MODULO.comercial,
  },
  {
    id: 'seed-menu-produtos',
    nome: 'Produtos',
    rota: '/comercial/produtos',
    icone: 'package',
    codigo: 'produtos',
    moduloId: MODULO.comercial,
  },
  {
    id: 'seed-menu-clientes',
    nome: 'Clientes',
    rota: '/cadastros/clientes',
    icone: 'users',
    codigo: 'clientes',
    // Cadastro de Clientes mora em Cadastros (junto de Tabelas de Preço,
    // Condições de Pagamento etc.), não em Comercial, que é operação.
    moduloId: MODULO.cadastros,
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
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-posicao-cliente',
    nome: 'Posição de Cliente',
    rota: '/comercial/posicao-cliente',
    icone: 'user-search',
    codigo: 'posicao-cliente',
    moduloId: MODULO.comercial,
  },
  {
    id: 'seed-menu-estoque',
    nome: 'Estoque',
    rota: '/comercial/estoque',
    icone: 'boxes',
    codigo: 'estoque',
    moduloId: MODULO.comercial,
  },
  // Notas de Saída é um cadastro mestre-detalhe: os itens vêm embutidos no
  // detalhe da nota (GET /notas-saida/:id), sem menu/rotina própria.
  {
    id: 'seed-menu-notas-saida',
    nome: 'Notas de Saída',
    rota: '/comercial/notas-saida',
    icone: 'file-text',
    codigo: 'notas-saida',
    moduloId: MODULO.comercial,
  },
  {
    id: 'seed-menu-titulos-receber',
    nome: 'Títulos a Receber',
    rota: '/comercial/titulos-receber',
    icone: 'receipt',
    codigo: 'titulos-receber',
    moduloId: MODULO.comercial,
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
    moduloId: MODULO.comercial,
  },
  {
    id: 'seed-menu-configuracoes-whatsapp',
    nome: 'WhatsApp',
    rota: '/admin/whatsapp',
    icone: 'message-circle',
    codigo: 'whatsapp-config',
    moduloId: MODULO.administracao,
  },
  // Mural da tela inicial. A rotina controla **administrar** o cadastro; ler
  // o mural não exige permissão nenhuma (ver InicioController) — um aviso
  // que só quem publica pudesse ler não avisaria ninguém.
  {
    id: 'seed-menu-comunicados',
    nome: 'Comunicados',
    rota: '/admin/comunicados',
    icone: 'megaphone',
    codigo: 'comunicados',
    moduloId: MODULO.administracao,
  },
  // Convênio de cobrança usado na 2ª via de boleto. Fica em Administração e
  // não em Cadastros de propósito: agência, conta e carteira erradas geram
  // boleto que o cliente não paga — não é dado que vendedor mantém.
  {
    id: 'seed-menu-contas-bancarias',
    nome: 'Contas Bancárias',
    rota: '/admin/contas-bancarias',
    icone: 'landmark',
    codigo: 'contas-bancarias',
    moduloId: MODULO.administracao,
  },
  {
    id: 'seed-menu-oportunidades',
    nome: 'Oportunidades',
    rota: '/crm/oportunidades',
    icone: 'trending-up',
    codigo: 'oportunidades',
    moduloId: MODULO.crm,
  },
  {
    id: 'seed-menu-atividades',
    nome: 'Atividades',
    rota: '/crm/atividades',
    icone: 'list-checks',
    codigo: 'atividades',
    moduloId: MODULO.crm,
  },
  {
    id: 'seed-menu-agenda',
    nome: 'Agenda',
    rota: '/crm/agenda',
    icone: 'calendar-days',
    codigo: 'agenda',
    moduloId: MODULO.crm,
  },
  {
    id: 'seed-menu-orcamentos',
    nome: 'Orçamentos',
    rota: '/crm/orcamentos',
    icone: 'clipboard-list',
    codigo: 'orcamentos',
    moduloId: MODULO.crm,
  },
  {
    id: 'seed-menu-vendedores',
    nome: 'Vendedores',
    rota: '/gerencial/vendedores',
    icone: 'user-round',
    codigo: 'vendedores',
    moduloId: MODULO.gerencial,
  },
  {
    id: 'seed-menu-objetivos',
    nome: 'Objetivos',
    rota: '/gerencial/objetivos',
    icone: 'target',
    codigo: 'objetivos',
    moduloId: MODULO.gerencial,
  },
  {
    id: 'seed-menu-categorias',
    nome: 'Categorias',
    rota: '/cadastros/categorias',
    icone: 'tags',
    codigo: 'categorias',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-condicoes-pagamento',
    nome: 'Condições de Pagamento',
    rota: '/cadastros/condicoes-pagamento',
    icone: 'credit-card',
    codigo: 'condicoes-pagamento',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-armazens',
    nome: 'Armazéns',
    rota: '/cadastros/armazens',
    icone: 'warehouse',
    codigo: 'armazens',
    moduloId: MODULO.cadastros,
  },
  // Itens da tabela de preço vêm embutidos no detalhe (GET /tabelas-preco/:id/itens), sem menu/rotina própria — mesmo racional de Notas de Saída.
  {
    id: 'seed-menu-tabelas-preco',
    nome: 'Tabelas de Preço',
    rota: '/cadastros/tabelas-preco',
    icone: 'tag',
    codigo: 'tabelas-preco',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-estados',
    nome: 'Estados',
    rota: '/cadastros/estados',
    icone: 'map',
    codigo: 'estados',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-municipios',
    nome: 'Municípios',
    rota: '/cadastros/municipios',
    icone: 'map-pin',
    codigo: 'municipios',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-ceps',
    nome: 'CEPs',
    rota: '/cadastros/ceps',
    icone: 'map-pinned',
    codigo: 'ceps',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-paises',
    nome: 'Países',
    rota: '/cadastros/paises',
    icone: 'globe',
    codigo: 'paises',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-cnaes',
    nome: 'CNAEs',
    rota: '/cadastros/cnaes',
    icone: 'file-badge',
    codigo: 'cnaes',
    moduloId: MODULO.cadastros,
  },
  {
    id: 'seed-menu-regras-desconto',
    nome: 'Regras de Desconto',
    rota: '/cadastros/regras-desconto',
    icone: 'percent',
    codigo: 'regras-desconto',
    moduloId: MODULO.cadastros,
  },
  // Consultas gerenciais: uma rotina por tela, para que a permissão de
  // exportar possa ser dada em uma e não na outra.
  {
    id: 'seed-menu-consulta-vendas-cliente',
    nome: 'Vendas por Cliente',
    rota: '/consultas/vendas-cliente',
    icone: 'users-round',
    codigo: 'consulta-vendas-cliente',
    moduloId: MODULO.consultas,
  },
  {
    id: 'seed-menu-consulta-vendas-produto',
    nome: 'Vendas por Produto',
    rota: '/consultas/vendas-produto',
    icone: 'package-search',
    codigo: 'consulta-vendas-produto',
    moduloId: MODULO.consultas,
  },
  {
    id: 'seed-menu-consulta-vendas-vendedor',
    nome: 'Vendas por Vendedor',
    rota: '/consultas/vendas-vendedor',
    icone: 'user-round',
    codigo: 'consulta-vendas-vendedor',
    moduloId: MODULO.consultas,
  },
  {
    id: 'seed-menu-dashboard-gerencial',
    nome: 'Dashboard Gerencial',
    rota: '/gerencial/dashboard',
    icone: 'gauge',
    codigo: 'dashboard-gerencial',
    moduloId: MODULO.gerencial,
  },
  {
    id: 'seed-menu-consulta-evolucao',
    nome: 'Evolução Mensal',
    rota: '/consultas/evolucao',
    icone: 'trending-up',
    codigo: 'consulta-evolucao',
    moduloId: MODULO.consultas,
  },
  // Criada originalmente pela migration 20260814192300_sugestao_compra e
  // ausente daqui até 2026-08-25 — base nova nascia sem a rotina, e a
  // ferramenta `sugerir_compras` do agente ficava fora do catálogo do
  // vendedor. Toda rotina que nasce numa migration precisa vir para cá
  // também: são as duas metades do mesmo estado esperado.
  {
    id: 'seed-menu-sugestao-compra',
    nome: 'Sugestão de Compra',
    rota: '/consultas/sugestao-compra',
    icone: 'lightbulb',
    codigo: 'sugestao-compra',
    moduloId: MODULO.consultas,
  },
  // A tela que guarda a chave da API de IA e a conta conectada — exclusiva do
  // Administrador. Veio da migration 20260814194200_agente_ia. A rotina de
  // **usar** o assistente é outra (`agente`, em ROTINAS_SEM_TELA), pendurada
  // neste mesmo menu: usar não é configurar.
  {
    id: 'seed-menu-agente-config',
    nome: 'Agente IA',
    rota: '/admin/agente',
    icone: 'bot',
    codigo: 'agente-config',
    moduloId: MODULO.administracao,
  },
];

/**
 * Rotinas **sem tela própria**: existem só para o RBAC, penduradas no menu onde
 * a capacidade aparece. Não geram item de menu — por isso não estão em `MENUS`.
 */
export const ROTINAS_SEM_TELA: {
  codigo: string;
  nome: string;
  menuId: string;
}[] = [
  // Quem enxerga os valores de comissão nos itens de orçamento e de nota de
  // saída. Fica sob Orçamentos, que é onde a comissão aparece primeiro.
  {
    codigo: 'comissao',
    nome: 'Comissão (valores)',
    menuId: 'seed-menu-orcamentos',
  },
  // Ler a conversa de WhatsApp **de outro vendedor**. Separada de
  // `whatsapp-conversas` ("as minhas") de propósito: ler o atendimento alheio é
  // concessão consciente, não efeito colateral de dar acesso à tela.
  {
    codigo: 'whatsapp-equipe',
    nome: 'WhatsApp da equipe',
    menuId: 'seed-menu-whatsapp',
  },
  // Usar o assistente — o ícone da topbar, em qualquer tela. Divide o menu com
  // `agente-config` (a tela da chave de API), que é rotina de menu e fica em
  // MENUS. São coisas diferentes: usar não é configurar.
  {
    codigo: 'agente',
    nome: 'Agente IA (usar)',
    menuId: 'seed-menu-agente-config',
  },
];

/** As nove ações do RBAC, na ordem em que a tela de Perfis as mostra. */
export const ACOES = [
  'visualizar',
  'cadastrar',
  'editar',
  'excluir',
  'importar',
  'exportar',
  'aprovar',
  'cancelar',
  'bloquear',
] as const;

export type Acao = (typeof ACOES)[number];

/**
 * Permissões com que cada perfil **nasce**.
 *
 * Valem na criação dos perfis (seed). Conceder algo a uma base que já existe é
 * trabalho de uma migration escrita para aquela decisão — ver o cabeçalho.
 */
// Perfil Vendedor: acesso à própria carteira de clientes (visualizar/cadastrar/
// editar) e consulta às demais telas comerciais. titulos-receber e notas-saida
// só têm rota de visualização na API (mirror read-only do ERP legado), então
// não faz sentido conceder outras ações a elas.
export const VENDEDOR_PERMISSOES: Record<string, Acao[]> = {
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
  // Atendimento por WhatsApp, as **próprias** conversas. Ler a conversa de
  // outro vendedor é a rotina `whatsapp-equipe`, que não está aqui de
  // propósito — ver SUPERVISAO_PERMISSOES.
  'whatsapp-conversas': ['visualizar', 'cadastrar', 'editar'],
  // Assistente de IA. `agente` é obrigatória: sem ela o ícone do assistente não
  // aparece para ninguém. As três seguintes não são detalhe — o catálogo de
  // ferramentas enviado ao modelo é filtrado pela permissão do usuário
  // (`AgenteToolsService.disponiveisPara`), então sem elas o agente responde
  // mas não enxerga histórico de vendas nem sugestão de compra, que são
  // justamente as perguntas do vendedor. `agente-config` fica de fora: é a
  // tela que guarda a chave da API, e é do Administrador.
  //
  // Isto espelha a migration 20260825010000_perm_agente_equipe_comercial. As
  // duas precisam andar juntas: o seed apaga todas as permissões e as recria,
  // então o que estiver só na migration desaparece na primeira base nova.
  agente: ['visualizar'],
  'sugestao-compra': ['visualizar'],
  'consulta-vendas-cliente': ['visualizar'],
  'consulta-vendas-produto': ['visualizar'],
};

/**
 * O que Supervisor e Gerente têm **além** do Vendedor.
 *
 * Hoje é só a leitura do atendimento da equipe. Ler a conversa de outro
 * vendedor é uma concessão consciente — e é leitura pura: gerente e supervisor
 * acompanham para monitorar, sem responder, reagir, agendar, vincular contato
 * a cliente ou sequer marcar como lida (marcar lida zeraria o contador do
 * vendedor e mandaria o visto azul ao cliente pelo aparelho dele). Por isso só
 * `visualizar`: as demais ações a API recusa de qualquer forma.
 *
 * O perfil Vendedor não recebe — é o atendimento dos colegas. O Diretor
 * também não: sem cadastro de vendedor, `resolverEscopoVendedores` devolve
 * "sem restrição", e a permissão abriria a empresa inteira em vez de uma equipe.
 */
export const SUPERVISAO_PERMISSOES: Record<string, Acao[]> = {
  ...VENDEDOR_PERMISSOES,
  'whatsapp-equipe': ['visualizar'],
};

/**
 * Aplica a estrutura — módulos, menus e rotinas — sem apagar nada.
 *
 * Idempotente: roda quantas vezes precisar. Só cria o que falta e atualiza
 * nome/rota/ícone/ordem do menu, que são texto do produto. **Não** toca em
 * `perfil_permissoes`, porque permissão concedida é configuração do cliente
 * (ver o cabeçalho deste arquivo).
 *
 * Item que sai do catálogo **não** é removido daqui: apagar menu ou rotina
 * derruba permissões junto e é decisão de uma migration escrita para isso, com
 * o nome de quem decidiu — como a `20260826010000_rotinas_admin_enxutas`.
 */
export async function sincronizarEstrutura(prisma: PrismaClient) {
  const criados = { modulos: 0, menus: 0, rotinas: 0 };

  for (const m of MODULOS) {
    const antes = await prisma.modulo.findUnique({ where: { id: m.id } });
    await prisma.modulo.upsert({
      where: { id: m.id },
      create: m,
      update: { nome: m.nome, icone: m.icone, ordem: m.ordem },
    });
    if (!antes) criados.modulos += 1;
  }

  // A ordem do menu é a posição na lista: mover um item aqui move na tela.
  for (const [i, m] of MENUS.entries()) {
    const antes = await prisma.menu.findUnique({ where: { id: m.id } });
    const dados = {
      moduloId: m.moduloId,
      nome: m.nome,
      rota: m.rota,
      icone: m.icone,
      ordem: i + 1,
      disponivelTelaPequena: m.disponivelTelaPequena ?? true,
    };
    await prisma.menu.upsert({
      where: { id: m.id },
      create: { id: m.id, ...dados },
      update: dados,
    });
    if (!antes) criados.menus += 1;

    const rotina = await prisma.rotina.findUnique({
      where: { codigo: m.codigo },
    });
    await prisma.rotina.upsert({
      where: { codigo: m.codigo },
      create: {
        id: `seed-rotina-${m.codigo}`,
        menuId: m.id,
        nome: m.nome,
        codigo: m.codigo,
      },
      update: {},
    });
    if (!rotina) criados.rotinas += 1;
  }

  for (const r of ROTINAS_SEM_TELA) {
    const antes = await prisma.rotina.findUnique({ where: { codigo: r.codigo } });
    await prisma.rotina.upsert({
      where: { codigo: r.codigo },
      create: {
        id: `seed-rotina-${r.codigo}`,
        menuId: r.menuId,
        nome: r.nome,
        codigo: r.codigo,
      },
      update: {},
    });
    if (!antes) criados.rotinas += 1;
  }

  return criados;
}

/**
 * A única permissão que o sincronizador **retira**, e é por segurança.
 *
 * O Diretor tem acesso irrestrito ao dado comercial e nenhum à administração do
 * sistema. Como a regra se deduz do módulo, uma rotina de Administração criada
 * depois nunca mais nasce liberada para ele — mas as que já escaparam antes de a
 * regra existir continuariam gravadas. Isto as retira, e é seguro repetir.
 *
 * Duas exceções, deliberadas: `agente` fica (é usar o assistente, não
 * administrá-lo — mora naquele menu só por dividi-lo com `agente-config`), e
 * `whatsapp-equipe` sai apesar de ser menu comercial, porque sem cadastro de
 * vendedor `resolverEscopoVendedores` devolve "sem restrição": a permissão que
 * dá "a equipe" a um supervisor daria a **empresa inteira** ao Diretor.
 */
export const ROTINAS_DE_USO_EM_ADMINISTRACAO = new Set(['agente']);
export const ROTINAS_FORA_DO_DIRETOR = new Set(['whatsapp-equipe']);

export async function corrigirPermissoesDoDiretor(prisma: PrismaClient) {
  const diretor = await prisma.perfil.findFirst({
    where: { nome: 'Diretor', deletedAt: null },
    select: { id: true },
  });
  if (!diretor) return 0;

  const proibidas = await prisma.rotina.findMany({
    where: {
      deletedAt: null,
      OR: [
        { menu: { moduloId: MODULO.administracao } },
        { codigo: { in: [...ROTINAS_FORA_DO_DIRETOR] } },
      ],
    },
    select: { id: true, codigo: true },
  });

  const alvo = proibidas
    .filter((r) => !ROTINAS_DE_USO_EM_ADMINISTRACAO.has(r.codigo))
    .map((r) => r.id);
  if (alvo.length === 0) return 0;

  const { count } = await prisma.perfilPermissao.deleteMany({
    where: { perfilId: diretor.id, rotinaId: { in: alvo } },
  });
  return count;
}
