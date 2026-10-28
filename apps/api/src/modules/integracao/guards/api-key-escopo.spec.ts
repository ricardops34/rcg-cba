import { ForbiddenException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

/**
 * SEC-12: a chave de API da integração com escopo por entidade e lista de IPs.
 * Lista vazia = sem restrição (as chaves anteriores seguem valendo).
 */
describe('ApiKeyGuard — escopo e IPs da chave', () => {
  const chave = (extra: Record<string, unknown> = {}) => ({
    id: 'k1',
    empresaId: 'e1',
    prefixo: 'itg_abcd1234',
    ativo: true,
    deletedAt: null,
    expiraEm: null,
    ultimoUso: new Date(),
    ultimaColeta: new Date(),
    ultimoEnvio: new Date(),
    escopo: [] as string[],
    ipsPermitidos: [] as string[],
    ...extra,
  });

  const montar = (k: ReturnType<typeof chave>) => {
    const prisma = {
      integracaoApiKey: {
        findUnique: jest.fn().mockResolvedValue(k),
        update: jest.fn().mockResolvedValue({}),
      },
      withTenant: jest.fn(async (_e: string, fn: (t: unknown) => unknown) =>
        fn({
          integracaoEndpointConfig: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({}),
          },
        }),
      ),
    };
    return { guard: new ApiKeyGuard(prisma as never), prisma };
  };

  const contexto = (url: string, ip: string, metodo = 'PUT') => {
    const req = {
      header: (n: string) => (n === 'x-api-key' ? 'itg_chave' : undefined),
      originalUrl: url,
      url,
      method: metodo,
      ip,
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as never;
  };

  describe('IPs', () => {
    it('sem lista, qualquer origem passa', async () => {
      const { guard } = montar(chave());
      await expect(guard.canActivate(contexto('/api/v1/integracao/produtos', '8.8.8.8'))).resolves.toBe(true);
    });

    it('IP fora da lista: 403', async () => {
      const { guard } = montar(chave({ ipsPermitidos: ['200.150.10.20'] }));
      await expect(
        guard.canActivate(contexto('/api/v1/integracao/produtos', '8.8.8.8')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('IP na lista, e dentro de uma faixa CIDR, passa (inclusive ::ffff: do Node)', async () => {
      const { guard } = montar(chave({ ipsPermitidos: ['200.150.10.20', '10.0.0.0/24'] }));
      await expect(guard.canActivate(contexto('/api/v1/integracao/produtos', '200.150.10.20'))).resolves.toBe(true);
      await expect(guard.canActivate(contexto('/api/v1/integracao/produtos', '::ffff:10.0.0.77'))).resolves.toBe(true);
      await expect(
        guard.canActivate(contexto('/api/v1/integracao/produtos', '10.0.1.5')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('escopo', () => {
    it('sem escopo, todas as entidades', async () => {
      const { guard } = montar(chave());
      await expect(guard.canActivate(contexto('/api/v1/integracao/clientes', '1.1.1.1'))).resolves.toBe(true);
    });

    it('entidade fora do escopo: 403', async () => {
      const { guard } = montar(chave({ escopo: ['produtos', 'estoque'] }));
      await expect(
        guard.canActivate(contexto('/api/v1/integracao/clientes', '1.1.1.1')),
      ).rejects.toThrow("não tem acesso a '/integracao/clientes'");
    });

    it('entidade do escopo passa, também em subrotas', async () => {
      const { guard } = montar(chave({ escopo: ['produtos'] }));
      await expect(guard.canActivate(contexto('/api/v1/integracao/produtos', '1.1.1.1'))).resolves.toBe(true);
      await expect(
        guard.canActivate(contexto('/api/v1/integracao/produtos/ABC?x=1', '1.1.1.1', 'PATCH')),
      ).resolves.toBe(true);
    });

    it('o sinal de vida (comunicacao) passa mesmo com a chave restrita', async () => {
      const { guard } = montar(chave({ escopo: ['produtos'] }));
      await expect(
        guard.canActivate(contexto('/api/v1/integracao/comunicacao', '1.1.1.1', 'POST')),
      ).resolves.toBe(true);
    });

    it('caminho que não casa com nenhuma entidade: chave restrita é recusada', async () => {
      const { guard } = montar(chave({ escopo: ['produtos'] }));
      await expect(guard.canActivate(contexto('/api/v1/outra-coisa', '1.1.1.1'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
