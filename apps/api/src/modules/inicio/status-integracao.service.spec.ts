import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StatusIntegracaoService } from './status-integracao.service';

describe('StatusIntegracaoService', () => {
  it('retorna a ultimaColeta e ultimoEnvio gravados na integracaoApiKey', async () => {
    const dataColeta = new Date('2026-09-25T10:00:00.000Z');
    const dataEnvio = new Date('2026-09-25T11:00:00.000Z');

    const mockPrisma = {
      integracaoApiKey: {
        findMany: jest.fn().mockResolvedValue([
          {
            ultimoUso: new Date('2026-09-25T09:00:00.000Z'),
            ultimaColeta: dataColeta,
            ultimoEnvio: dataEnvio,
          },
        ]),
      },
    };

    const withTenant = jest.fn().mockImplementation((_id, fn) => fn(mockPrisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        StatusIntegracaoService,
        { provide: PrismaService, useValue: { withTenant, ...mockPrisma } },
      ],
    }).compile();

    const service = moduleRef.get(StatusIntegracaoService);
    const result = await service.obterStatus('empresa-123');

    expect(withTenant).toHaveBeenCalledWith('empresa-123', expect.any(Function));
    expect(result).toEqual({
      ultimaColeta: dataColeta.toISOString(),
      ultimoEnvio: dataEnvio.toISOString(),
    });
  });

  it('usa fallback em tabelas integradas quando datas na integracaoApiKey forem nulas', async () => {
    const dataEstoque = new Date('2026-09-25T12:00:00.000Z');
    const dataOrcamento = new Date('2026-09-25T12:30:00.000Z');

    const mockPrisma = {
      integracaoApiKey: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      estoque: {
        findFirst: jest.fn().mockResolvedValue({ dataEnvio: dataEstoque, updatedAt: dataEstoque }),
      },
      notaSaida: { findFirst: jest.fn().mockResolvedValue(null) },
      tituloReceber: { findFirst: jest.fn().mockResolvedValue(null) },
      produto: { findFirst: jest.fn().mockResolvedValue(null) },
      cliente: { findFirst: jest.fn().mockResolvedValue(null) },
      orcamento: {
        findFirst: jest.fn().mockResolvedValue({ updatedAt: dataOrcamento }),
      },
    };

    const withTenant = jest.fn().mockImplementation((_id, fn) => fn(mockPrisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        StatusIntegracaoService,
        { provide: PrismaService, useValue: { withTenant, ...mockPrisma } },
      ],
    }).compile();

    const service = moduleRef.get(StatusIntegracaoService);
    const result = await service.obterStatus('empresa-456');

    expect(result).toEqual({
      ultimaColeta: dataEstoque.toISOString(),
      ultimoEnvio: dataOrcamento.toISOString(),
    });
  });
});
