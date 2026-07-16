import { NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as equipeModule from '../../common/hierarquia/equipe';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

jest.mock('../../common/hierarquia/equipe');

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    nome: 'Fulano',
    email: 'fulano@teste.com',
    empresaAtivaId: 'empresa-1',
    isAdmin: false,
    permissoes: [],
    ...overrides,
  };
}

describe('ClientesService', () => {
  let service: ClientesService;
  let tx: {
    cliente: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  const equipeMock = equipeModule.equipeColaboradorIds as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      cliente: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      withTenant: jest.fn((_empresaId: string, fn: (tx: unknown) => unknown) => fn(tx)),
    };
    service = new ClientesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('admin (equipe null) não filtra por colaboradorId', async () => {
      equipeMock.mockResolvedValue(null);
      await service.findAll('empresa-1', buildUser({ isAdmin: true }), { page: 1, pageSize: 20 });
      const where = tx.cliente.findMany.mock.calls[0][0].where;
      expect(where.colaboradorId).toBeUndefined();
      expect(where.empresaId).toBe('empresa-1');
    });

    it('vendedor filtra apenas pelos colaboradores da própria equipe', async () => {
      equipeMock.mockResolvedValue(['col-1', 'col-2']);
      await service.findAll('empresa-1', buildUser(), { page: 1, pageSize: 20 });
      const where = tx.cliente.findMany.mock.calls[0][0].where;
      expect(where.colaboradorId).toEqual({ in: ['col-1', 'col-2'] });
    });

    it('aplica busca por razão social, fantasia, CNPJ/CPF e código ERP', async () => {
      equipeMock.mockResolvedValue(null);
      await service.findAll('empresa-1', buildUser({ isAdmin: true }), {
        page: 1,
        pageSize: 20,
        search: 'acme',
      });
      const where = tx.cliente.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(4);
    });
  });

  describe('create', () => {
    it('grava empresaId, createdBy/updatedBy e converte strings vazias em null', async () => {
      tx.cliente.create.mockResolvedValue({ id: 'cli-1' });
      await service.create('empresa-1', buildUser(), {
        razaoSocial: 'Acme',
        nomeFantasia: '',
      } as never);
      const data = tx.cliente.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        razaoSocial: 'Acme',
        nomeFantasia: null,
        empresaId: 'empresa-1',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      });
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando o cliente não existe na empresa', async () => {
      tx.cliente.findFirst.mockResolvedValue(null);
      await expect(
        service.update('empresa-1', buildUser(), 'cli-x', { razaoSocial: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
      expect(tx.cliente.update).not.toHaveBeenCalled();
    });

    it('atualiza e registra updatedBy quando o cliente existe', async () => {
      tx.cliente.findFirst.mockResolvedValue({ id: 'cli-1' });
      tx.cliente.update.mockResolvedValue({ id: 'cli-1' });
      await service.update('empresa-1', buildUser(), 'cli-1', { razaoSocial: 'Nova' } as never);
      expect(tx.cliente.update).toHaveBeenCalledWith({
        where: { id: 'cli-1' },
        data: { razaoSocial: 'Nova', updatedBy: 'user-1' },
      });
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando o cliente não existe na empresa', async () => {
      tx.cliente.findFirst.mockResolvedValue(null);
      await expect(service.remove('empresa-1', buildUser(), 'cli-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('faz soft delete: seta deletedAt/deletedBy e ativo=false', async () => {
      tx.cliente.findFirst.mockResolvedValue({ id: 'cli-1' });
      tx.cliente.update.mockResolvedValue({ id: 'cli-1' });
      await service.remove('empresa-1', buildUser(), 'cli-1');
      expect(tx.cliente.update).toHaveBeenCalledWith({
        where: { id: 'cli-1' },
        data: { deletedAt: expect.any(Date), deletedBy: 'user-1', ativo: false },
      });
    });
  });
});
