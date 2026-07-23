import { Acao, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
const CRUD: Acao[] = ['visualizar', 'cadastrar', 'editar', 'excluir'];
const SENHA_PADRAO = 'Demo@123';

interface EmpresaSeed {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  adminEmail: string;
  adminNome: string;
  gerenteEmail: string;
  gerenteNome: string;
}

const EMPRESAS: EmpresaSeed[] = [
  {
    cnpj: '00000000000191',
    razaoSocial: 'RCG Distribuidora LTDA',
    nomeFantasia: 'RCG Distribuidora',
    adminEmail: 'admin@demo.com',
    adminNome: 'Administrador do Sistema',
    gerenteEmail: 'gerente@rcg.com',
    gerenteNome: 'Ricardo Gerente',
  },
  {
    cnpj: '11111111000191',
    razaoSocial: 'Andrade Comercial Ltda',
    nomeFantasia: 'Andrade Distribuidora',
    adminEmail: 'admin@andrade.com',
    adminNome: 'Administrador Andrade',
    gerenteEmail: 'gerente@andrade.com',
    gerenteNome: 'Fernanda Lima',
  },
  {
    cnpj: '22222222000191',
    razaoSocial: 'Beta Comércio e Distribuição Ltda',
    nomeFantasia: 'Beta Comércio',
    adminEmail: 'admin@beta.com',
    adminNome: 'Administrador Beta',
    gerenteEmail: 'gerente@beta.com',
    gerenteNome: 'Rodrigo Alves',
  },
];

async function main() {
  // Estrutura de menu — compartilhada por todas as empresas (é o mesmo sistema).
  const moduloAdministracao = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-administracao' },
    create: { id: 'seed-modulo-administracao', nome: 'Administração', icone: 'settings', ordem: 1 },
    update: { nome: 'Administração', icone: 'settings', ordem: 1 },
  });

  const moduloComercial = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-comercial' },
    create: { id: 'seed-modulo-comercial', nome: 'Comercial', icone: 'briefcase', ordem: 2 },
    update: { nome: 'Comercial', icone: 'briefcase', ordem: 2 },
  });

  const menuDefs: { id: string; nome: string; rota: string; icone: string; codigo: string; moduloId: string }[] = [
    { id: 'seed-menu-empresas', nome: 'Empresas', rota: '/admin/empresas', icone: 'building', codigo: 'empresas', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-usuarios', nome: 'Usuários', rota: '/admin/usuarios', icone: 'users', codigo: 'usuarios', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-perfis', nome: 'Perfis', rota: '/admin/perfis', icone: 'shield', codigo: 'perfis', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-estrutura', nome: 'Estrutura de Menu', rota: '/admin/estrutura', icone: 'layout-grid', codigo: 'menus', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-produtos', nome: 'Produtos', rota: '/comercial/produtos', icone: 'package', codigo: 'produtos', moduloId: moduloComercial.id },
  ];

  for (const [i, m] of menuDefs.entries()) {
    const menu = await prisma.menu.upsert({
      where: { id: m.id },
      create: { id: m.id, moduloId: m.moduloId, nome: m.nome, rota: m.rota, icone: m.icone, ordem: i + 1 },
      update: { moduloId: m.moduloId, nome: m.nome, rota: m.rota, icone: m.icone },
    });

    await prisma.rotina.upsert({
      where: { codigo: m.codigo },
      create: { id: `seed-rotina-${m.codigo}`, menuId: menu.id, nome: m.nome, codigo: m.codigo },
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

  const rotinas = await prisma.rotina.findMany({ where: { deletedAt: null } });
  const rotinaProdutos = rotinas.find((r) => r.codigo === 'produtos');
  const senhaHash = await bcrypt.hash(SENHA_PADRAO, 12);

  // Concede uma lista de ações de uma rotina a um perfil (idempotente).
  const conceder = async (perfilId: string, rotinaId: string, acoes: Acao[]) => {
    for (const acao of acoes) {
      await prisma.perfilPermissao.upsert({
        where: { perfilId_rotinaId_acao: { perfilId, rotinaId, acao } },
        create: { perfilId, rotinaId, acao, permitido: true },
        update: { permitido: true },
      });
    }
  };

  console.log('Seed concluído. Credenciais (todas com a mesma senha):\n');

  // Cada empresa é isolada (RLS): perfis e vínculos de usuário só existem
  // dentro dela. Isso permite testar que um usuário de uma empresa nunca vê
  // dados de outra.
  for (const cfg of EMPRESAS) {
    const empresa = await prisma.empresa.upsert({
      where: { cnpj: cfg.cnpj },
      create: {
        razaoSocial: cfg.razaoSocial,
        nomeFantasia: cfg.nomeFantasia,
        cnpj: cfg.cnpj,
        ativo: true,
      },
      update: { razaoSocial: cfg.razaoSocial, nomeFantasia: cfg.nomeFantasia },
    });

    const perfilAdmin = await prisma.perfil.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: 'Administrador' } },
      create: {
        empresaId: empresa.id,
        nome: 'Administrador',
        descricao: 'Perfil com acesso total ao sistema',
        sistemaBase: true,
      },
      update: {},
    });

    for (const rotina of rotinas) {
      for (const acao of ACOES) {
        await prisma.perfilPermissao.upsert({
          where: { perfilId_rotinaId_acao: { perfilId: perfilAdmin.id, rotinaId: rotina.id, acao } },
          create: { perfilId: perfilAdmin.id, rotinaId: rotina.id, acao, permitido: true },
          update: { permitido: true },
        });
      }
    }

    const perfilGerente = await prisma.perfil.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: 'Gerente' } },
      create: {
        empresaId: empresa.id,
        nome: 'Gerente',
        descricao: 'Gerencia o catálogo de produtos da empresa',
        sistemaBase: false,
      },
      update: {},
    });
    if (rotinaProdutos) await conceder(perfilGerente.id, rotinaProdutos.id, CRUD);

    const perfilSupervisor = await prisma.perfil.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: 'Supervisor' } },
      create: {
        empresaId: empresa.id,
        nome: 'Supervisor',
        descricao: 'Consulta o catálogo de produtos da empresa',
        sistemaBase: false,
      },
      update: {},
    });
    if (rotinaProdutos) await conceder(perfilSupervisor.id, rotinaProdutos.id, ['visualizar']);

    // Usuário administrador
    const admin = await prisma.usuario.upsert({
      where: { email: cfg.adminEmail },
      create: { nome: cfg.adminNome, email: cfg.adminEmail, senhaHash, ativo: true },
      update: { senhaHash },
    });
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: admin.id, empresaId: empresa.id } },
      create: { usuarioId: admin.id, empresaId: empresa.id, perfilId: perfilAdmin.id },
      update: { perfilId: perfilAdmin.id, ativo: true },
    });

    // Usuário gerente
    const gerenteUsuario = await prisma.usuario.upsert({
      where: { email: cfg.gerenteEmail },
      create: { nome: cfg.gerenteNome, email: cfg.gerenteEmail, senhaHash, ativo: true },
      update: { senhaHash },
    });
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: gerenteUsuario.id, empresaId: empresa.id } },
      create: {
        usuarioId: gerenteUsuario.id,
        empresaId: empresa.id,
        perfilId: perfilGerente.id,
      },
      update: { perfilId: perfilGerente.id, ativo: true },
    });

    console.log(`— ${cfg.nomeFantasia} (${empresa.id})`);
    console.log(`  admin:   ${cfg.adminEmail}`);
    console.log(`  gerente: ${cfg.gerenteEmail}`);
  }

  // Vincula o admin da primeira empresa também à segunda, como Administrador
  // lá também — para testar a troca de empresa ativa (várias empresas, um
  // único login).
  const [primeira, segunda] = EMPRESAS;
  if (primeira && segunda) {
    const usuarioMultiEmpresa = await prisma.usuario.findUnique({
      where: { email: primeira.adminEmail },
    });
    const empresaSegunda = await prisma.empresa.findUnique({ where: { cnpj: segunda.cnpj } });
    const perfilAdminSegunda = empresaSegunda
      ? await prisma.perfil.findUnique({
          where: { empresaId_nome: { empresaId: empresaSegunda.id, nome: 'Administrador' } },
        })
      : null;

    if (usuarioMultiEmpresa && empresaSegunda && perfilAdminSegunda) {
      await prisma.usuarioEmpresa.upsert({
        where: {
          usuarioId_empresaId: { usuarioId: usuarioMultiEmpresa.id, empresaId: empresaSegunda.id },
        },
        create: {
          usuarioId: usuarioMultiEmpresa.id,
          empresaId: empresaSegunda.id,
          perfilId: perfilAdminSegunda.id,
        },
        update: { perfilId: perfilAdminSegunda.id, ativo: true },
      });
      console.log(
        `\n${primeira.adminEmail} também tem acesso a "${segunda.nomeFantasia}" (para testar troca de empresa).`,
      );
    }
  }

  console.log(`\nSenha de todos os usuários: ${SENHA_PADRAO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
