import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Prova, contra um Postgres real, a garantia central documentada em
 * apps/api/prisma/migrations/README.md: Row-Level Security isola os dados
 * por empresa mesmo que a aplicação "esqueça" o `WHERE empresaId = ...`.
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
      tx.cliente.create({
        data: { empresaId: empresaA.id, codigoErp: `CLI-A-${sufixo}`, razaoSocial: 'Cliente A' },
      }),
    );
    await prisma.withTenant(empresaB.id, (tx) =>
      tx.cliente.create({
        data: { empresaId: empresaB.id, codigoErp: `CLI-B-${sufixo}`, razaoSocial: 'Cliente B' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.withTenant(empresaA.id, (tx) =>
      tx.cliente.deleteMany({ where: { empresaId: empresaA.id } }),
    );
    await prisma.withTenant(empresaB.id, (tx) =>
      tx.cliente.deleteMany({ where: { empresaId: empresaB.id } }),
    );
    await prisma.empresa.deleteMany({ where: { id: { in: [empresaA.id, empresaB.id] } } });
    await prisma.$disconnect();
  });

  it('com a empresa A ativa, enxerga só os clientes da empresa A', async () => {
    const clientes = await prisma.withTenant(empresaA.id, (tx) => tx.cliente.findMany());
    const empresaIds = new Set(clientes.map((c) => c.empresaId));
    expect(empresaIds.has(empresaA.id)).toBe(true);
    expect(empresaIds.has(empresaB.id)).toBe(false);
  });

  it('com a empresa B ativa, enxerga só os clientes da empresa B', async () => {
    const clientes = await prisma.withTenant(empresaB.id, (tx) => tx.cliente.findMany());
    const empresaIds = new Set(clientes.map((c) => c.empresaId));
    expect(empresaIds.has(empresaB.id)).toBe(true);
    expect(empresaIds.has(empresaA.id)).toBe(false);
  });

  it('sem empresa ativa no contexto, a policy nega tudo (default-deny)', async () => {
    const clientes = await prisma.cliente.findMany({
      where: { id: { in: await idsDosClientesDeTeste() } },
    });
    expect(clientes).toHaveLength(0);
  });

  it('buscar por id de outra empresa através do contexto errado não retorna nada', async () => {
    const clienteB = await prisma.withTenant(empresaB.id, (tx) => tx.cliente.findFirst());
    expect(clienteB).not.toBeNull();

    const vazamento = await prisma.withTenant(empresaA.id, (tx) =>
      tx.cliente.findUnique({ where: { id: clienteB!.id } }),
    );
    expect(vazamento).toBeNull();
  });

  async function idsDosClientesDeTeste(): Promise<string[]> {
    const clientesA = await prisma.withTenant(empresaA.id, (tx) => tx.cliente.findMany());
    const clientesB = await prisma.withTenant(empresaB.id, (tx) => tx.cliente.findMany());
    return [...clientesA, ...clientesB].map((c) => c.id);
  }
});
