/**
 * Seed base — limpa os dados e popula uma base mínima:
 *   - 1 empresa: BJSoftware
 *   - referências públicas do IBGE: países, UFs, municípios e CNAEs
 *   - 1 usuário Admin com acesso (perfil Administrador) a ela
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
import {
  MODULO,
  SUPERVISAO_PERMISSOES,
  ROTINAS_DE_USO_EM_ADMINISTRACAO,
  ROTINAS_FORA_DO_DIRETOR,
  sincronizarEstrutura,
  VENDEDOR_PERMISSOES,
} from './catalogo-sistema';
import * as bcrypt from 'bcryptjs';
import { sincronizarReferenciasIbge } from './sync-ibge';

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
  // Política de senha, por empresa. Era uma tabela singleton **global** com
  // tela própria; virou parâmetro em 2026-08-26, por decisão do usuário. Quem
  // lê é o PoliticaSenhaService, e para um usuário em mais de uma empresa vale
  // a combinação **mais restritiva** das políticas dele — a conta é uma só.
  //
  // Zero quer dizer "sem limite" em tamanho máximo, expiração e histórico: a
  // tela de Parâmetros não tem campo vazio, só número.
  {
    parametro: 'SENHA_TAMANHO_MINIMO',
    tipo: 'numero' as const,
    tamanho: 2,
    conteudo: '8',
    descricao: 'Mínimo de caracteres da senha',
  },
  {
    parametro: 'SENHA_TAMANHO_MAXIMO',
    tipo: 'numero' as const,
    tamanho: 3,
    conteudo: '0',
    descricao: 'Máximo de caracteres da senha; 0 = sem limite',
  },
  {
    parametro: 'SENHA_EXIGIR_MAIUSCULA',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'true',
    descricao: 'Exige ao menos uma letra maiúscula na senha',
  },
  {
    parametro: 'SENHA_EXIGIR_MINUSCULA',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'false',
    descricao: 'Exige ao menos uma letra minúscula na senha',
  },
  {
    parametro: 'SENHA_EXIGIR_NUMERO',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'true',
    descricao: 'Exige ao menos um número na senha',
  },
  {
    parametro: 'SENHA_EXIGIR_ESPECIAL',
    tipo: 'booleano' as const,
    tamanho: null,
    conteudo: 'false',
    descricao: 'Exige ao menos um caractere especial na senha',
  },
  {
    parametro: 'SENHA_DIAS_PARA_EXPIRAR',
    tipo: 'numero' as const,
    tamanho: 4,
    conteudo: '0',
    descricao: 'Dias até a senha expirar e exigir troca; 0 = nunca expira',
  },
  {
    parametro: 'SENHA_HISTORICO_QUANTIDADE',
    tipo: 'numero' as const,
    tamanho: 2,
    conteudo: '0',
    descricao: 'Quantas senhas anteriores não podem ser reutilizadas; 0 = não valida',
  },
  {
    parametro: 'SENHA_TENTATIVAS_ANTES_BLOQUEIO',
    tipo: 'numero' as const,
    tamanho: 2,
    conteudo: '5',
    descricao: 'Tentativas de login sem sucesso antes de bloquear a conta',
  },
  {
    parametro: 'SENHA_MINUTOS_BLOQUEIO',
    tipo: 'numero' as const,
    tamanho: 4,
    conteudo: '15',
    descricao: 'Minutos que a conta fica bloqueada após exceder as tentativas',
  },
];


/**
 * Rotinas que o Diretor **não** recebe.
 *
 * O Diretor tem acesso irrestrito ao dado comercial, mas não à administração
 * do sistema. Isso era uma lista de códigos escrita à mão, e o problema dela
 * não era o conteúdo: era a direção. Toda rotina de Administração criada
 * depois nascia **liberada** para o Diretor até alguém lembrar de vir aqui —
 * e quatro já haviam escapado (`agente-config`, que guarda a chave da API de
 * IA; `whatsapp-config`; `contas-bancarias`; `comunicados`).
 *
 * Agora a regra se deduz do lugar da rotina: **está sob o módulo
 * Administração, o Diretor não tem**. Rotina nova de administração nasce
 * fechada, sem depender de memória.
 *
 * Esta lista ficou só para o que é sensível **fora** daquele módulo, onde a
 * dedução não alcança.
 */

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

/**
 * Módulos, menus e rotinas saem de `catalogo-sistema.ts`, que é a definição
 * única — o mesmo arquivo que o `sincronizar-catalogo.ts` aplica numa base já
 * existente. Este seed **não repete a lista**: repetir foi o que fez as duas
 * versões divergirem, e é o que a auditoria de 2026-08-25 encontrou três vezes.
 */
async function bootstrapMenu() {
  await sincronizarEstrutura(prisma);

  // O módulo do menu vem junto: é dele que se deduz o que o Diretor não recebe
  // (ver bootstrapPerfilDiretor).
  return prisma.rotina.findMany({
    where: { deletedAt: null },
    include: { menu: { select: { moduloId: true } } },
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

  // Supervisor e Gerente: as telas do Vendedor mais a leitura do atendimento
  // da equipe (SUPERVISAO_PERMISSOES).
  //
  // O que muda entre eles não é o RBAC, e sim o alcance da carteira, que vem
  // do cadastro de Vendedor (flags supervisor/gerente + supervisorId/
  // gerenteId) e é resolvido por resolverEscopoVendedores — por isso os dois
  // compartilham a mesma lista. A única diferença para o Vendedor é
  // `whatsapp-equipe`, que a hierarquia sozinha não concede: ler conversa
  // alheia exige a permissão **e** o vendedor estar no time
  // (ver escopoLeituraWhatsapp).
  for (const [nome, descricao] of [
    ['Supervisor', 'Mesmas telas do Vendedor; a carteira alcançada vem da hierarquia do cadastro de Vendedores'],
    ['Gerente', 'Mesmas telas do Vendedor; a carteira alcançada vem da hierarquia do cadastro de Vendedores'],
  ]) {
    const perfil = await prisma.perfil.create({
      data: { nome, descricao, sistemaBase: false },
    });
    await prisma.perfilPermissao.createMany({
      data: rotinas
        .filter((rotina) => rotina.codigo in SUPERVISAO_PERMISSOES)
        .flatMap((rotina) =>
          SUPERVISAO_PERMISSOES[rotina.codigo].map((acao) => ({
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
 * Diretor recebe permissão explícita em tudo que **não** é do módulo
 * Administração (ver ROTINAS_FORA_DO_DIRETOR); o acesso irrestrito aos *dados*
 * (escopo de vendedor) vem de resolverEscopoVendedores retornar null quando o
 * usuário não tem nenhum Vendedor vinculado — por isso um usuário Diretor
 * nunca deve ganhar um registro de Vendedor.
 */
async function bootstrapPerfilDiretor(
  rotinas: { id: string; codigo: string; menu: { moduloId: string } }[],
) {
  const perfilDiretor = await prisma.perfil.create({
    data: {
      nome: 'Diretor',
      descricao: 'Acesso irrestrito aos dados comerciais, sem administração do sistema',
      sistemaBase: false,
    },
  });
  await prisma.perfilPermissao.createMany({
    data: rotinas
      .filter(
        (rotina) =>
          (rotina.menu.moduloId !== MODULO.administracao ||
            ROTINAS_DE_USO_EM_ADMINISTRACAO.has(rotina.codigo)) &&
          !ROTINAS_FORA_DO_DIRETOR.has(rotina.codigo),
      )
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
  const { perfilAdmin } = await bootstrapPerfis(rotinas);
  await bootstrapPerfilDiretor(rotinas);

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 12);

  // Um único usuário Admin, vinculado como Administrador na empresa criada.
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

  // Referências públicas (países, UFs, municípios, CNAEs). Entram no seed
  // porque uma base nova sem elas não cadastra um cliente: endereço e CNAE não
  // têm em que se apoiar. Vinham do import do MySQL até ele ser aposentado.
  //
  // É upsert por chave natural, então reexecutar não duplica — e roda depois
  // do resto para que uma falha de rede não impeça o admin e a empresa de
  // serem criados. Sem internet, o console avisa e o `sync:ibge` completa
  // depois.
  console.log('\nCarregando referências públicas do IBGE...');
  try {
    await sincronizarReferenciasIbge();
  } catch (erro) {
    console.warn(
      `\n[aviso] Referências do IBGE não carregadas: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
    console.warn(
      '[aviso] Rode `pnpm --filter @plataforma/api sync:ibge` quando houver rede.',
    );
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
