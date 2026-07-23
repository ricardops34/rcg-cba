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
  { razaoSocial: 'BJSoftware LTDA', nomeFantasia: 'BJSoftware', cnpj: '11222333000181', alias: 'bjs'},
  { razaoSocial: 'RCG Distribuidora LTDA', nomeFantasia: 'RCG Distribuidora', cnpj: '22333444000172', alias: 'rcg' },
  { razaoSocial: 'CBA Distribuidora LTDA', nomeFantasia: 'CBA Distribuidora', cnpj: '33444555000163', alias: 'cba' },
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

async function limparDados() {
  // Ordem respeita as FKs. usuarioEmpresa e vendedor têm auto-referência
  // (superiorId; supervisorId/gerenteId): zera antes de apagar para não
  // violar a constraint.
  await prisma.vendedor.updateMany({ data: { supervisorId: null, gerenteId: null } });
  await prisma.vendedor.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.usuarioEmpresa.updateMany({ data: { superiorId: null } });
  await prisma.usuarioEmpresa.deleteMany();
  await prisma.perfilPermissao.deleteMany();
  await prisma.perfil.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.empresa.deleteMany();
}

async function bootstrapMenu() {
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
  const moduloGerencial = await prisma.modulo.upsert({
    where: { id: 'seed-modulo-gerencial' },
    create: { id: 'seed-modulo-gerencial', nome: 'Gerencial', icone: 'users-round', ordem: 3 },
    update: { nome: 'Gerencial', icone: 'users-round', ordem: 3 },
  });

  const menuDefs = [
    { id: 'seed-menu-empresas', nome: 'Empresas', rota: '/admin/empresas', icone: 'building', codigo: 'empresas', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-usuarios', nome: 'Usuários', rota: '/admin/usuarios', icone: 'users', codigo: 'usuarios', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-perfis', nome: 'Perfis', rota: '/admin/perfis', icone: 'shield', codigo: 'perfis', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-estrutura', nome: 'Estrutura de Menu', rota: '/admin/estrutura', icone: 'layout-grid', codigo: 'menus', moduloId: moduloAdministracao.id },
    { id: 'seed-menu-produtos', nome: 'Produtos', rota: '/comercial/produtos', icone: 'package', codigo: 'produtos', moduloId: moduloComercial.id },
    { id: 'seed-menu-vendedores', nome: 'Vendedores', rota: '/gerencial/vendedores', icone: 'user-round', codigo: 'vendedores', moduloId: moduloGerencial.id },
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

  return prisma.rotina.findMany({ where: { deletedAt: null } });
}

async function main() {
  console.log('Limpando dados existentes...');
  await limparDados();

  console.log('Reconstruindo estrutura de menu/rotinas...');
  const rotinas = await bootstrapMenu();

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 12);

  // Um único usuário Admin, vinculado como Administrador nas 3 empresas.
  const admin = await prisma.usuario.create({
    data: { nome: ADMIN.nome, email: ADMIN.email, senhaHash, ativo: true },
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

    // Perfil Administrador da empresa: acesso total (todas as ações em todas
    // as rotinas). sistemaBase = perfil protegido/base do sistema.
    const perfilAdmin = await prisma.perfil.create({
      data: {
        empresaId: empresa.id,
        nome: 'Administrador',
        descricao: 'Perfil com acesso total ao sistema',
        sistemaBase: true,
      },
    });

    await prisma.perfilPermissao.createMany({
      data: rotinas.flatMap((rotina) =>
        ACOES.map((acao) => ({ perfilId: perfilAdmin.id, rotinaId: rotina.id, acao, permitido: true })),
      ),
      skipDuplicates: true,
    });

    await prisma.usuarioEmpresa.create({
      data: { usuarioId: admin.id, empresaId: empresa.id, perfilId: perfilAdmin.id, ativo: true },
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
