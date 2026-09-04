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
