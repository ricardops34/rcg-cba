import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IntegracaoEndpointsService } from './integracao-endpoints.service';
import { CATALOGO_ENDPOINTS_INTEGRACAO } from './integracao-endpoints.catalogo';

describe('IntegracaoEndpointsService', () => {
  it('lista todos os endpoints do catálogo combinando com o banco', async () => {
    const dataUso = new Date('2026-09-25T14:00:00.000Z');
    const mockPrisma = {
      integracaoEndpointConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            endpointKey: 'produtos',
            nome: 'Produtos',
            ativo: false,
            ultimoUso: dataUso,
            totalChamadas: 42,
          },
        ]),
      },
    };

    const withTenant = jest.fn().mockImplementation((_id, fn) => fn(mockPrisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegracaoEndpointsService,
        { provide: PrismaService, useValue: { withTenant, ...mockPrisma } },
      ],
    }).compile();

    const service = moduleRef.get(IntegracaoEndpointsService);
    const result = await service.listarEndpoints('empresa-123');

    expect(withTenant).toHaveBeenCalledWith('empresa-123', expect.any(Function));
    expect(result.length).toBe(CATALOGO_ENDPOINTS_INTEGRACAO.length);

    const produtoItem = result.find((item) => item.endpointKey === 'produtos');
    expect(produtoItem).toBeDefined();
    expect(produtoItem?.ativo).toBe(false);
    expect(produtoItem?.totalChamadas).toBe(42);
    expect(produtoItem?.ultimoUso).toBe(dataUso.toISOString());

    const clienteItem = result.find((item) => item.endpointKey === 'clientes');
    expect(clienteItem).toBeDefined();
    expect(clienteItem?.ativo).toBe(true);
    expect(clienteItem?.totalChamadas).toBe(0);
  });

  it('permite alternar status ativo/inativo de um endpoint', async () => {
    const mockPrisma = {
      integracaoEndpointConfig: {
        upsert: jest.fn().mockResolvedValue({
          id: 'config-1',
          empresaId: 'empresa-123',
          endpointKey: 'clientes',
          nome: 'Clientes',
          ativo: false,
          ultimoUso: null,
          totalChamadas: 0,
        }),
      },
    };

    const withTenant = jest.fn().mockImplementation((_id, fn) => fn(mockPrisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegracaoEndpointsService,
        { provide: PrismaService, useValue: { withTenant, ...mockPrisma } },
      ],
    }).compile();

    const service = moduleRef.get(IntegracaoEndpointsService);
    const result = await service.alternarStatus('empresa-123', 'clientes', false);

    expect(result.endpointKey).toBe('clientes');
    expect(result.ativo).toBe(false);
  });
});

describe('IntegracaoKeysService — escopo da chave (SEC-12)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { IntegracaoKeysService } = require('./integracao-keys.service');
  const montar = () => {
    const prisma = {
      integracaoApiKey: {
        create: jest.fn().mockResolvedValue({ id: 'k1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'k1' }),
        update: jest.fn().mockResolvedValue({ id: 'k1' }),
      },
    };
    return { servico: new IntegracaoKeysService(prisma as never), prisma };
  };

  it('grava o escopo e os IPs (sem repetição) ao criar', async () => {
    const { servico, prisma } = montar();
    await servico.create('e1', 'u1', {
      nome: 'ERP',
      escopo: ['produtos', 'produtos', 'estoque'],
      ipsPermitidos: ['10.0.0.1', '10.0.0.1'],
    });
    expect(prisma.integracaoApiKey.create.mock.calls[0][0].data).toMatchObject({
      escopo: ['produtos', 'estoque'],
      ipsPermitidos: ['10.0.0.1'],
    });
  });

  it('entidade que não existe no catálogo é recusada (a chave nasceria bloqueada)', async () => {
    const { servico } = montar();
    await expect(
      servico.create('e1', 'u1', { nome: 'ERP', escopo: ['produtos', 'produtoss'] }),
    ).rejects.toThrow(/produtoss/);
  });

  it('sem informar, a chave nasce sem restrição', async () => {
    const { servico, prisma } = montar();
    await servico.create('e1', 'u1', { nome: 'ERP' });
    expect(prisma.integracaoApiKey.create.mock.calls[0][0].data).toMatchObject({
      escopo: [],
      ipsPermitidos: [],
    });
  });

  it('editar o escopo valida do mesmo jeito; esvaziar tira a restrição', async () => {
    const { servico, prisma } = montar();
    await expect(servico.update('e1', 'u1', 'k1', { escopo: ['nada'] })).rejects.toThrow(/nada/);
    await servico.update('e1', 'u1', 'k1', { escopo: [], ipsPermitidos: [] });
    expect(prisma.integracaoApiKey.update.mock.calls[0][0].data).toMatchObject({
      escopo: [],
      ipsPermitidos: [],
    });
  });
});
