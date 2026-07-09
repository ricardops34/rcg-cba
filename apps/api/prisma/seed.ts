import { Acao, Cargo, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

// Dados reais exportados do sistema antigo (backup MySQL) — ver
// prisma/seed-data/legacy.json, gerado pelo extrator do dump.
interface LegacyVendedor {
  id: number;
  codErp: string | null;
  nome: string | null;
  nomeReduzido: string | null;
  email: string | null;
  status: string | null;
  desligado: string | null;
}
interface LegacyMeta {
  vendedorId: number;
  mes: number;
  ano: number;
  valor: number | null;
  numeroCliente: number | null;
  novoCliente: number | null;
}
interface LegacyCliente {
  id: number;
  codErp: string | null;
  status: string | null;
  razao: string | null;
  fantasia: string | null;
  endereco: string | null;
  bairro: string | null;
  uf: string | null;
  municipio: string | null;
  cep: string | null;
  telefone: string | null;
  celular: string | null;
  contato: string | null;
  cnpjCpf: string | null;
  ie: string | null;
  email: string | null;
  vendedorId: number | null;
}
interface LegacyData {
  vendedores: LegacyVendedor[];
  supervisores: LegacyVendedor[];
  supervisorVendedor: { vendedorId: number; supervisorId: number }[];
  metas: LegacyMeta[];
  clientes: LegacyCliente[];
}

function carregarLegado(): LegacyData | null {
  const arquivo = path.join(__dirname, 'seed-data', 'legacy.json');
  if (!fs.existsSync(arquivo)) return null;
  return JSON.parse(fs.readFileSync(arquivo, 'utf8')) as LegacyData;
}

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
  vendedores: { email: string; nome: string; codigoErp: string; nomeReduzido: string }[];
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
    vendedores: [
      { email: 'ana@rcg.com', nome: 'Ana Cristina Gomes', codigoErp: '000034', nomeReduzido: 'ANA' },
      { email: 'carlos@rcg.com', nome: 'Carlos Augusto Pagliarini', codigoErp: '000320', nomeReduzido: 'CARLOS' },
    ],
  },
  {
    cnpj: '11111111000191',
    razaoSocial: 'Andrade Comercial Ltda',
    nomeFantasia: 'Andrade Distribuidora',
    adminEmail: 'admin@andrade.com',
    adminNome: 'Administrador Andrade',
    gerenteEmail: 'gerente@andrade.com',
    gerenteNome: 'Fernanda Lima',
    vendedores: [
      { email: 'joao@andrade.com', nome: 'João Pereira', codigoErp: '000011', nomeReduzido: 'JOAO' },
      { email: 'marcia@andrade.com', nome: 'Márcia Duarte', codigoErp: '000012', nomeReduzido: 'MARCIA' },
    ],
  },
  {
    cnpj: '22222222000191',
    razaoSocial: 'Beta Comércio e Distribuição Ltda',
    nomeFantasia: 'Beta Comércio',
    adminEmail: 'admin@beta.com',
    adminNome: 'Administrador Beta',
    gerenteEmail: 'gerente@beta.com',
    gerenteNome: 'Rodrigo Alves',
    vendedores: [
      { email: 'patricia@beta.com', nome: 'Patrícia Santos', codigoErp: '000021', nomeReduzido: 'PATRICIA' },
      { email: 'bruno@beta.com', nome: 'Bruno Costa', codigoErp: '000022', nomeReduzido: 'BRUNO' },
    ],
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
    { id: 'seed-menu-colaboradores', nome: 'Vendedores', rota: '/comercial/vendedores', icone: 'user-round', codigo: 'colaboradores', moduloId: moduloComercial.id },
    { id: 'seed-menu-clientes', nome: 'Clientes', rota: '/comercial/clientes', icone: 'contact', codigo: 'clientes', moduloId: moduloComercial.id },
    { id: 'seed-menu-metas', nome: 'Metas', rota: '/comercial/metas', icone: 'target', codigo: 'metas', moduloId: moduloComercial.id },
    { id: 'seed-menu-acompanhamento', nome: 'Acompanhamento', rota: '/comercial/acompanhamento', icone: 'line-chart', codigo: 'acompanhamento', moduloId: moduloComercial.id },
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
  const rotinaColaboradores = rotinas.find((r) => r.codigo === 'colaboradores');
  const rotinaClientes = rotinas.find((r) => r.codigo === 'clientes');
  const rotinaMetas = rotinas.find((r) => r.codigo === 'metas');
  const rotinaAcompanhamento = rotinas.find((r) => r.codigo === 'acompanhamento');
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

  // Cada empresa é isolada (RLS): perfis, colaboradores e o vínculo de
  // usuário só existem dentro dela. Isso permite testar que um usuário de
  // uma empresa nunca vê dados de outra.
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
        descricao: 'Gerencia a equipe comercial e o cadastro de vendedores',
        sistemaBase: false,
      },
      update: {},
    });

    // Gerente: gerencia a equipe (vendedores), define metas e acompanha o
    // desempenho de toda a estrutura abaixo dele.
    if (rotinaColaboradores) await conceder(perfilGerente.id, rotinaColaboradores.id, CRUD);
    if (rotinaClientes) await conceder(perfilGerente.id, rotinaClientes.id, CRUD);
    if (rotinaMetas) await conceder(perfilGerente.id, rotinaMetas.id, CRUD);
    if (rotinaAcompanhamento) await conceder(perfilGerente.id, rotinaAcompanhamento.id, ['visualizar']);

    // Supervisor: mesmas telas do gerente, mas o escopo (equipe) é resolvido
    // pela hierarquia na API — vê apenas os vendedores abaixo dele.
    const perfilSupervisor = await prisma.perfil.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: 'Supervisor' } },
      create: {
        empresaId: empresa.id,
        nome: 'Supervisor',
        descricao: 'Coordena os vendedores da própria equipe, define metas e acompanha resultados',
        sistemaBase: false,
      },
      update: {},
    });
    if (rotinaColaboradores) await conceder(perfilSupervisor.id, rotinaColaboradores.id, CRUD);
    if (rotinaClientes) await conceder(perfilSupervisor.id, rotinaClientes.id, CRUD);
    if (rotinaMetas) await conceder(perfilSupervisor.id, rotinaMetas.id, CRUD);
    if (rotinaAcompanhamento) await conceder(perfilSupervisor.id, rotinaAcompanhamento.id, ['visualizar']);

    // Vendedor: consulta a estrutura, vê as próprias metas e acompanha o
    // próprio desempenho (a API restringe a linha a ele mesmo).
    const perfilVendedor = await prisma.perfil.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: 'Vendedor' } },
      create: {
        empresaId: empresa.id,
        nome: 'Vendedor',
        descricao: 'Consulta a equipe, as próprias metas e o próprio desempenho',
        sistemaBase: false,
      },
      update: {},
    });
    if (rotinaColaboradores) await conceder(perfilVendedor.id, rotinaColaboradores.id, ['visualizar']);
    if (rotinaClientes) await conceder(perfilVendedor.id, rotinaClientes.id, ['visualizar', 'cadastrar', 'editar']);
    if (rotinaMetas) await conceder(perfilVendedor.id, rotinaMetas.id, ['visualizar']);
    if (rotinaAcompanhamento) await conceder(perfilVendedor.id, rotinaAcompanhamento.id, ['visualizar']);

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

    // Usuário gerente + colaborador (topo da hierarquia comercial da empresa)
    const gerenteUsuario = await prisma.usuario.upsert({
      where: { email: cfg.gerenteEmail },
      create: { nome: cfg.gerenteNome, email: cfg.gerenteEmail, senhaHash, ativo: true },
      update: { senhaHash },
    });
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: gerenteUsuario.id, empresaId: empresa.id } },
      create: { usuarioId: gerenteUsuario.id, empresaId: empresa.id, perfilId: perfilGerente.id },
      update: { perfilId: perfilGerente.id, ativo: true },
    });
    const gerenteColaborador = await prisma.colaborador.upsert({
      where: { usuarioId: gerenteUsuario.id },
      create: {
        empresaId: empresa.id,
        usuarioId: gerenteUsuario.id,
        cargo: Cargo.gerente,
        superiorId: null,
        ativo: true,
      },
      update: { empresaId: empresa.id, cargo: Cargo.gerente },
    });

    // Vendedores, reportando ao gerente da própria empresa
    for (const v of cfg.vendedores) {
      const usuario = await prisma.usuario.upsert({
        where: { email: v.email },
        create: { nome: v.nome, email: v.email, senhaHash, ativo: true },
        update: { senhaHash },
      });
      await prisma.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: empresa.id } },
        create: { usuarioId: usuario.id, empresaId: empresa.id, perfilId: perfilVendedor.id },
        update: { perfilId: perfilVendedor.id, ativo: true },
      });
      await prisma.colaborador.upsert({
        where: { usuarioId: usuario.id },
        create: {
          empresaId: empresa.id,
          usuarioId: usuario.id,
          cargo: Cargo.vendedor,
          superiorId: gerenteColaborador.id,
          codigoErp: v.codigoErp,
          nomeReduzido: v.nomeReduzido,
          ativo: true,
        },
        update: {
          empresaId: empresa.id,
          superiorId: gerenteColaborador.id,
          codigoErp: v.codigoErp,
          nomeReduzido: v.nomeReduzido,
        },
      });
    }

    console.log(`— ${cfg.nomeFantasia} (${empresa.id})`);
    console.log(`  admin:   ${cfg.adminEmail}`);
    console.log(`  gerente: ${cfg.gerenteEmail}`);
    console.log(`  vendedores: ${cfg.vendedores.map((v) => v.email).join(', ')}`);
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

  // --------------------------------------------------------------------
  // Importação dos dados reais do sistema antigo (vendedores, supervisores,
  // hierarquia e metas) para a empresa RCG. Faz parte da substituição do
  // sistema legado: os números precisam ser reais para as análises.
  // --------------------------------------------------------------------
  const legado = carregarLegado();
  if (legado && primeira) {
    const empresaRcg = await prisma.empresa.findUnique({ where: { cnpj: primeira.cnpj } });
    if (empresaRcg) {
      const [perfilSup, perfilVend, gerenteUser] = await Promise.all([
        prisma.perfil.findUnique({ where: { empresaId_nome: { empresaId: empresaRcg.id, nome: 'Supervisor' } } }),
        prisma.perfil.findUnique({ where: { empresaId_nome: { empresaId: empresaRcg.id, nome: 'Vendedor' } } }),
        prisma.usuario.findUnique({ where: { email: primeira.gerenteEmail } }),
      ]);
      const gerenteColab = gerenteUser
        ? await prisma.colaborador.findUnique({ where: { usuarioId: gerenteUser.id } })
        : null;

      if (perfilSup && perfilVend && gerenteColab) {
        const usados = new Set<string>();
        const emailPara = (p: LegacyVendedor, tipo: string) => {
          const real = p.email?.trim().toLowerCase();
          if (real && !usados.has(real)) {
            usados.add(real);
            return real;
          }
          const base = (p.codErp || String(p.id)).replace(/[^a-z0-9]/gi, '');
          let e = `${tipo}-${base}@rcg.local`.toLowerCase();
          let i = 1;
          while (usados.has(e)) e = `${tipo}-${base}-${i++}@rcg.local`;
          usados.add(e);
          return e;
        };

        const importarColab = async (
          p: LegacyVendedor,
          tipo: string,
          cargo: Cargo,
          perfilId: string,
          superiorId: string | null,
        ) => {
          const nome = p.nome || p.nomeReduzido || `${tipo} ${p.codErp ?? p.id}`;
          const ativo = p.desligado !== 'S';
          const email = emailPara(p, tipo);
          const usuario = await prisma.usuario.upsert({
            where: { email },
            create: { nome, email, senhaHash, ativo },
            update: { nome, senhaHash, ativo },
          });
          await prisma.usuarioEmpresa.upsert({
            where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: empresaRcg.id } },
            create: { usuarioId: usuario.id, empresaId: empresaRcg.id, perfilId },
            update: { perfilId, ativo: true },
          });
          const colab = await prisma.colaborador.upsert({
            where: { usuarioId: usuario.id },
            create: {
              empresaId: empresaRcg.id,
              usuarioId: usuario.id,
              cargo,
              superiorId,
              codigoErp: p.codErp,
              nomeReduzido: p.nomeReduzido,
              ativo,
            },
            update: { empresaId: empresaRcg.id, cargo, superiorId, codigoErp: p.codErp, nomeReduzido: p.nomeReduzido },
          });
          return colab.id;
        };

        // Supervisores → abaixo do gerente
        const supColabPorLegado = new Map<number, string>();
        for (const s of legado.supervisores) {
          const id = await importarColab(s, 'sup', Cargo.supervisor, perfilSup.id, gerenteColab.id);
          supColabPorLegado.set(s.id, id);
        }

        // Vendedor → supervisor (via supervisor_vendedor); fallback: gerente
        const superiorDoVendedor = new Map<number, number>();
        for (const sv of legado.supervisorVendedor) superiorDoVendedor.set(sv.vendedorId, sv.supervisorId);

        const vendColabPorLegado = new Map<number, string>();
        for (const v of legado.vendedores) {
          const supLegadoId = superiorDoVendedor.get(v.id);
          const superiorId = (supLegadoId && supColabPorLegado.get(supLegadoId)) || gerenteColab.id;
          const id = await importarColab(v, 'vend', Cargo.vendedor, perfilVend.id, superiorId);
          vendColabPorLegado.set(v.id, id);
        }

        // Metas mensais reais
        let metasImportadas = 0;
        for (const m of legado.metas) {
          const colaboradorId = vendColabPorLegado.get(m.vendedorId);
          if (!colaboradorId) continue;
          await prisma.metaVendedor.upsert({
            where: { colaboradorId_ano_mes: { colaboradorId, ano: m.ano, mes: m.mes } },
            create: {
              empresaId: empresaRcg.id,
              colaboradorId,
              ano: m.ano,
              mes: m.mes,
              valorObjetivo: m.valor ?? 0,
              metaClientes: Math.round(m.numeroCliente ?? 0),
              metaNovosClientes: Math.round(m.novoCliente ?? 0),
            },
            update: {
              valorObjetivo: m.valor ?? 0,
              metaClientes: Math.round(m.numeroCliente ?? 0),
              metaNovosClientes: Math.round(m.novoCliente ?? 0),
            },
          });
          metasImportadas++;
        }

        // Clientes reais (carteira). Só importa se ainda não houver clientes,
        // para manter o seed rápido e idempotente sobre uma base grande.
        let clientesImportados = 0;
        const jaTemClientes = await prisma.cliente.count({ where: { empresaId: empresaRcg.id } });
        if (jaTemClientes === 0 && legado.clientes?.length) {
          const registros = legado.clientes.map((c) => ({
            empresaId: empresaRcg.id,
            colaboradorId: (c.vendedorId && vendColabPorLegado.get(c.vendedorId)) || null,
            codigoErp: c.codErp,
            razaoSocial: c.razao ?? 'SEM NOME',
            nomeFantasia: c.fantasia,
            cnpjCpf: c.cnpjCpf,
            inscricaoEstadual: c.ie,
            contato: c.contato,
            email: c.email,
            telefone: c.telefone,
            celular: c.celular,
            endereco: c.endereco,
            bairro: c.bairro,
            municipio: c.municipio,
            uf: c.uf,
            cep: c.cep,
            ativo: c.status !== 'B',
          }));
          const LOTE = 500;
          for (let i = 0; i < registros.length; i += LOTE) {
            const r = await prisma.cliente.createMany({
              data: registros.slice(i, i + LOTE),
              skipDuplicates: true,
            });
            clientesImportados += r.count;
          }
        }

        console.log(
          `\nDados legados importados para RCG: ${legado.supervisores.length} supervisores, ` +
            `${legado.vendedores.length} vendedores, ${metasImportadas} metas, ` +
            `${clientesImportados || jaTemClientes} clientes.`,
        );
      }
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
