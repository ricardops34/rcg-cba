/**
 * O contador de usuários da tela do SaaS lê uma tabela com RLS
 * (`usuario_empresas`). Fora de `withTenant` a policy compara `empresaId` com
 * um `app.current_empresa_id` vazio, não bate em nada e devolve zero — **sem
 * erro nenhum**. A primeira versão de `listarEmpresas` caiu exatamente nisso e
 * mostrava "0 usuários" para uma empresa com dez.
 *
 * Este teste fixa o comportamento na fronteira que importa: a contagem tem de
 * acontecer dentro de `withTenant`, com o id da empresa que está sendo contada.
 * Um include na consulta de `empresa` volta a dar zero e derruba isto.
 */
import { PlataformaService } from './plataforma.service';

type Chamada = { empresaId: string };

function prismaFalso(vinculosPorEmpresa: Record<string, number>) {
  const chamadas: Chamada[] = [];
  const empresas = Object.keys(vinculosPorEmpresa).map((id, i) => ({
    id,
    razaoSocial: `Empresa ${i}`,
    nomeFantasia: `Empresa ${i}`,
    cnpj: '00000000000000',
    alias: null,
    situacao: 'ativa' as const,
    testeExpiraEm: null,
    limiteUsuarios: null,
    createdAt: new Date('2026-01-01'),
  }));

  const prisma = {
    empresa: {
      findMany: () => Promise.resolve(empresas),
      count: () => Promise.resolve(empresas.length),
    },
    // Só entrega vínculos a quem entrou pelo withTenant da empresa certa —
    // é o que a policy do Postgres faz.
    withTenant: <T>(
      empresaId: string,
      fn: (tx: unknown) => Promise<T>,
    ): Promise<T> => {
      chamadas.push({ empresaId });
      const tx = {
        usuarioEmpresa: {
          findMany: ({ where }: { where: { empresaId: string } }) =>
            Promise.resolve(
              where.empresaId === empresaId
                ? Array.from({ length: vinculosPorEmpresa[empresaId] }, () => ({
                    usuario: { ultimoLogin: new Date('2026-09-01T10:00:00Z') },
                  }))
                : [],
            ),
        },
      };
      return fn(tx);
    },
  };

  return { prisma, chamadas };
}

const query = {
  page: 1,
  pageSize: 20,
  sortOrder: 'asc' as const,
};

describe('listarEmpresas — contagem de usuários sob RLS', () => {
  it('conta os vinculos de cada empresa, e nao zero', async () => {
    const { prisma } = prismaFalso({ 'emp-a': 10, 'emp-b': 3 });
    const service = new PlataformaService(prisma as never);

    const r = await service.listarEmpresas(query as never);

    expect(r.data.map((e) => e.usuariosAtivos)).toEqual([10, 3]);
  });

  it('entra em withTenant com o id da empresa contada', async () => {
    const { prisma, chamadas } = prismaFalso({ 'emp-a': 1, 'emp-b': 2 });
    const service = new PlataformaService(prisma as never);

    await service.listarEmpresas(query as never);

    // Sem isto, a consulta rodaria fora do tenant e a policy devolveria vazio.
    expect(chamadas.map((c) => c.empresaId).sort()).toEqual(['emp-a', 'emp-b']);
  });

  it('traz o ultimo acesso, que depende da mesma leitura', async () => {
    const { prisma } = prismaFalso({ 'emp-a': 2 });
    const service = new PlataformaService(prisma as never);

    const r = await service.listarEmpresas(query as never);

    expect(r.data[0].ultimoAcesso).toBe('2026-09-01T10:00:00.000Z');
  });

  it('empresa sem vinculo ativo devolve zero, sem quebrar', async () => {
    const { prisma } = prismaFalso({ 'emp-a': 0 });
    const service = new PlataformaService(prisma as never);

    const r = await service.listarEmpresas(query as never);

    expect(r.data[0].usuariosAtivos).toBe(0);
    expect(r.data[0].ultimoAcesso).toBeNull();
  });
});

/**
 * A contagem de "quantas empresas esta conta administra" atravessa empresas, e
 * `usuario_empresas` tem RLS. Um `groupBy` solto devolve zero — foi o que a
 * primeira versão fez, escondido por um fallback `?? 1` que fazia o zero passar
 * por "administra uma".
 *
 * O caminho certo é a segunda policy da tabela (`self_usuario_empresas`), que
 * libera as linhas do próprio usuário: `withUsuario`. Este teste exige que a
 * contagem passe por ele, com o id de cada administrador.
 */
describe('listarAdministradoresDaEmpresa — contagem entre empresas', () => {
  const EMPRESA = 'emp-1';
  const PERFIL_ADMIN = 'perfil-admin';

  function prismaFalso(empresasPorUsuario: Record<string, number>) {
    const usuarios = Object.keys(empresasPorUsuario);
    const viaWithUsuario: string[] = [];

    return {
      viaWithUsuario,
      prisma: {
        empresa: { findFirst: () => Promise.resolve({ id: EMPRESA }) },
        perfil: { findFirst: () => Promise.resolve({ id: PERFIL_ADMIN }) },
        withTenant: <T>(_id: string, fn: (tx: unknown) => Promise<T>) =>
          fn({
            usuarioEmpresa: {
              findMany: () =>
                Promise.resolve(
                  usuarios.map((id) => ({
                    usuarioId: id,
                    usuario: {
                      nome: `Nome ${id}`,
                      email: `${id}@exemplo.com`,
                      ativo: true,
                      ultimoLogin: null,
                    },
                  })),
                ),
            },
          }),
        // Só conta certo quem entrou pelo withUsuario do próprio id — é o que
        // a policy `self` faz.
        withUsuario: <T>(usuarioId: string, fn: (tx: unknown) => Promise<T>) => {
          viaWithUsuario.push(usuarioId);
          return fn({
            usuarioEmpresa: {
              count: ({ where }: { where: { usuarioId: string } }) =>
                Promise.resolve(
                  where.usuarioId === usuarioId
                    ? empresasPorUsuario[usuarioId]
                    : 0,
                ),
            },
          });
        },
        // Se alguém voltar ao groupBy fora de contexto, ele responde vazio,
        // como a policy responderia.
        usuarioEmpresa: { groupBy: () => Promise.resolve([]) },
      },
    };
  }

  it('conta as empresas de cada administrador, e nao assume 1', async () => {
    const { prisma } = prismaFalso({ 'user-a': 3, 'user-b': 1 });
    const service = new PlataformaService(prisma as never);

    const r = await service.listarAdministradoresDaEmpresa(EMPRESA);

    expect(r.map((a) => a.empresasQueAdministra)).toEqual([3, 1]);
  });

  it('passa por withUsuario com o id de cada um', async () => {
    const { prisma, viaWithUsuario } = prismaFalso({ 'user-a': 2, 'user-b': 5 });
    const service = new PlataformaService(prisma as never);

    await service.listarAdministradoresDaEmpresa(EMPRESA);

    expect(viaWithUsuario.sort()).toEqual(['user-a', 'user-b']);
  });
});
