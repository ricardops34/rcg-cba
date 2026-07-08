import { PrismaClient, Acao } from '@prisma/client';
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

async function main() {
  const empresa = await prisma.empresa.upsert({
    where: { cnpj: '00000000000191' },
    create: {
      razaoSocial: 'Empresa Demonstração LTDA',
      nomeFantasia: 'Empresa Demo',
      cnpj: '00000000000191',
      ativo: true,
    },
    update: {},
  });

  const modulo = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-administracao' },
    create: {
      id: 'seed-modulo-administracao',
      nome: 'Administração',
      icone: 'settings',
      ordem: 1,
    },
    update: {},
  });

  const menuDefs: { id: string; nome: string; rota: string; icone: string; codigo: string }[] = [
    { id: 'seed-menu-empresas', nome: 'Empresas', rota: '/admin/empresas', icone: 'building', codigo: 'empresas' },
    { id: 'seed-menu-usuarios', nome: 'Usuários', rota: '/admin/usuarios', icone: 'users', codigo: 'usuarios' },
    { id: 'seed-menu-perfis', nome: 'Perfis', rota: '/admin/perfis', icone: 'shield', codigo: 'perfis' },
    { id: 'seed-menu-estrutura', nome: 'Estrutura de Menu', rota: '/admin/estrutura', icone: 'layout-grid', codigo: 'menus' },
    { id: 'seed-menu-colaboradores', nome: 'Colaboradores', rota: '/comercial/colaboradores', icone: 'user-round', codigo: 'colaboradores' },
  ];

  for (const [i, m] of menuDefs.entries()) {
    const menu = await prisma.menu.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        moduloId: modulo.id,
        nome: m.nome,
        rota: m.rota,
        icone: m.icone,
        ordem: i + 1,
      },
      update: {},
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

  // "modulos" e "rotinas" também são rotinas administráveis (gestão da própria estrutura de menu)
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

  const rotinas = await prisma.rotina.findMany({ where: { deletedAt: null } });
  for (const rotina of rotinas) {
    for (const acao of ACOES) {
      await prisma.perfilPermissao.upsert({
        where: {
          perfilId_rotinaId_acao: { perfilId: perfilAdmin.id, rotinaId: rotina.id, acao },
        },
        create: { perfilId: perfilAdmin.id, rotinaId: rotina.id, acao, permitido: true },
        update: { permitido: true },
      });
    }
  }

  const senhaHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@demo.com' },
    create: {
      nome: 'Administrador do Sistema',
      email: 'admin@demo.com',
      senhaHash,
      ativo: true,
    },
    update: {},
  });

  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: admin.id, empresaId: empresa.id } },
    create: { usuarioId: admin.id, empresaId: empresa.id, perfilId: perfilAdmin.id },
    update: { perfilId: perfilAdmin.id, ativo: true },
  });

  console.log('Seed concluído.');
  console.log(`Empresa: ${empresa.nomeFantasia} (${empresa.id})`);
  console.log('Login: admin@demo.com / senha: Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
