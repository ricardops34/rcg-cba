import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Prova, contra um Postgres real, a garantia central documentada em
 * apps/api/prisma/migrations/README.md: Row-Level Security isola os dados
 * por empresa mesmo que a aplicação "esqueça" o `WHERE empresaId = ...`.
 *
 * Isso só funciona se a API conectar com um role sem BYPASSRLS/superuser e
 * que não seja dono das tabelas (ver migration 20260715221500) — rodar este
 * teste é a forma de garantir que a DATABASE_URL do ambiente de teste está
 * configurada com esse role, não com o role de migrations.
 */
describe('Row-Level Security (e2e)', () => {
  const prisma = new PrismaService();
  let empresaA: { id: string };
  let empresaB: { id: string };

  beforeAll(async () => {
    await prisma.$connect();

    const sufixo = randomUUID();
    empresaA = await prisma.empresa.create({
      data: {
        razaoSocial: `RLS Test A ${sufixo}`,
        nomeFantasia: `RLS Test A ${sufixo}`,
        cnpj: `A-${sufixo}`,
      },
    });
    empresaB = await prisma.empresa.create({
      data: {
        razaoSocial: `RLS Test B ${sufixo}`,
        nomeFantasia: `RLS Test B ${sufixo}`,
        cnpj: `B-${sufixo}`,
      },
    });

    await prisma.withTenant(empresaA.id, (tx) =>
      tx.perfil.create({
        data: { empresaId: empresaA.id, nome: 'Perfil A' },
      }),
    );
    await prisma.withTenant(empresaB.id, (tx) =>
      tx.perfil.create({
        data: { empresaId: empresaB.id, nome: 'Perfil B' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.withTenant(empresaA.id, (tx) =>
      tx.perfil.deleteMany({ where: { empresaId: empresaA.id } }),
    );
    await prisma.withTenant(empresaB.id, (tx) =>
      tx.perfil.deleteMany({ where: { empresaId: empresaB.id } }),
    );
    await prisma.empresa.deleteMany({ where: { id: { in: [empresaA.id, empresaB.id] } } });
    await prisma.$disconnect();
  });

  it('com a empresa A ativa, enxerga só os perfis da empresa A', async () => {
    const perfis = await prisma.withTenant(empresaA.id, (tx) => tx.perfil.findMany());
    const empresaIds = new Set(perfis.map((p) => p.empresaId));
    expect(empresaIds.has(empresaA.id)).toBe(true);
    expect(empresaIds.has(empresaB.id)).toBe(false);
  });

  it('com a empresa B ativa, enxerga só os perfis da empresa B', async () => {
    const perfis = await prisma.withTenant(empresaB.id, (tx) => tx.perfil.findMany());
    const empresaIds = new Set(perfis.map((p) => p.empresaId));
    expect(empresaIds.has(empresaB.id)).toBe(true);
    expect(empresaIds.has(empresaA.id)).toBe(false);
  });

  it('sem empresa ativa no contexto, a policy nega tudo (default-deny)', async () => {
    const perfis = await prisma.perfil.findMany({
      where: { id: { in: await idsDosPerfisDeTeste() } },
    });
    expect(perfis).toHaveLength(0);
  });

  it('buscar por id de outra empresa através do contexto errado não retorna nada', async () => {
    const perfilB = await prisma.withTenant(empresaB.id, (tx) => tx.perfil.findFirst());
    expect(perfilB).not.toBeNull();

    // Mesmo pedindo explicitamente o id do perfil da empresa B, com o
    // contexto de tenant apontando pra empresa A a policy do Postgres barra
    // a linha — é essa dupla trava que protege contra um bug de query que
    // "esqueceria" o filtro de empresaId na aplicação.
    const vazamento = await prisma.withTenant(empresaA.id, (tx) =>
      tx.perfil.findUnique({ where: { id: perfilB!.id } }),
    );
    expect(vazamento).toBeNull();
  });

  async function idsDosPerfisDeTeste(): Promise<string[]> {
    const perfisA = await prisma.withTenant(empresaA.id, (tx) => tx.perfil.findMany());
    const perfisB = await prisma.withTenant(empresaB.id, (tx) => tx.perfil.findMany());
    return [...perfisA, ...perfisB].map((p) => p.id);
  }
});
