import { ConflictException } from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import type { PortalClienteUser } from './portal-cliente-auth.types';

const user: PortalClienteUser = {
  credencialId: 'credencial-1',
  empresaId: 'empresa-1',
  clienteId: 'cliente-1',
  contatoId: 'contato-1',
  perfilId: 'perfil-1',
  nome: 'Ana Compradora',
  email: 'ana@cliente.com.br',
  permissoes: ['orcamentos.visualizar', 'orcamentos.aprovar', 'orcamentos.recusar'],
};

describe('PortalClienteService', () => {
  it('aprova o mesmo orçamento enviado que ficará pendente para o ERP', async () => {
    const atual = {
      id: 'orcamento-1',
      numero: 42,
      status: 'enviado',
      codigoLegado: null,
      dataValidade: new Date(Date.now() + 86_400_000),
      vendedorId: 'vendedor-1',
    };
    const tx = {
      orcamento: {
        findFirst: jest.fn().mockResolvedValue(atual),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...atual, ...data })),
      },
      atividade: { create: jest.fn().mockResolvedValue({ id: 'atividade-1' }) },
    };
    const prisma = { withTenant: jest.fn((_empresaId, callback) => callback(tx)) };
    const service = new PortalClienteService(prisma as never);

    const result = await service.decidirOrcamento(user, atual.id, 'aprovado');

    expect(result.status).toBe('aprovado');
    expect(result.codigoLegado).toBeNull();
    expect(tx.orcamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: atual.id },
        data: expect.objectContaining({
          status: 'aprovado',
          clienteDecididoPorContatoId: user.contatoId,
        }),
      }),
    );
    expect(tx.atividade.create).toHaveBeenCalledTimes(1);
  });

  it('não permite aprovar orçamento que não esteja enviado', async () => {
    const tx = {
      orcamento: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'orcamento-1',
          numero: 42,
          status: 'rascunho',
          dataValidade: null,
        }),
      },
    };
    const prisma = { withTenant: jest.fn((_empresaId, callback) => callback(tx)) };
    const service = new PortalClienteService(prisma as never);

    await expect(service.decidirOrcamento(user, 'orcamento-1', 'aprovado')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
