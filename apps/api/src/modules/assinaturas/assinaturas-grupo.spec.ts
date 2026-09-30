import { AssinaturasService } from './assinaturas.service';

describe('assinatura única do grupo econômico', () => {
  it('duas empresas consultam o mesmo contrato', async () => {
    const assinatura = {
      id: 'contrato',
      valorMensalidade: 100,
      plano: {
        valorMensal: 100,
        valorTrimestral: 300,
        valorSemestral: 600,
        valorAnual: 1200,
      },
    };
    const prisma = {
      empresa: {
        findFirst: jest.fn().mockResolvedValue({ grupoEconomicoId: 'g' }),
      },
      grupoEconomico: { findFirst: jest.fn().mockResolvedValue({ id: 'g' }) },
      assinatura: { findUnique: jest.fn().mockResolvedValue(assinatura) },
    };
    const service = new AssinaturasService(prisma as never);
    expect((await service.getAssinaturaEmpresa('a'))?.id).toBe('contrato');
    expect((await service.getAssinaturaEmpresa('b'))?.id).toBe('contrato');
    expect(prisma.assinatura.findUnique).toHaveBeenCalledWith({
      where: { grupoEconomicoId: 'g' },
      include: { plano: true },
    });
  });
  it('consulta sem contrato não cria assinatura gratuita', async () => {
    const prisma = {
      grupoEconomico: { findFirst: jest.fn().mockResolvedValue({ id: 'g' }) },
      assinatura: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    expect(
      await new AssinaturasService(prisma as never).getAssinaturaGrupo('g'),
    ).toBeNull();
  });
  it('atualização de assinatura aplica situação e limites a todo o grupo', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      grupoEconomico: { findFirst: jest.fn().mockResolvedValue({ id: 'g' }) },
      assinatura: {
        findUnique: jest.fn().mockResolvedValue({ planoId: 'p' }),
        upsert: jest
          .fn()
          .mockResolvedValue({ situacao: 'atrasada', valorMensalidade: 100 }),
      },
      plano: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'p',
            ativo: true,
            valorMensal: 100,
            limiteUsuarios: 5,
          }),
      },
      empresa: { updateMany: jest.fn() },
    };
    const service = new AssinaturasService({
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    } as never);
    await service.updateAssinaturaGrupo('g', { situacao: 'atrasada' }, 'admin');
    expect(tx.empresa.updateMany).toHaveBeenCalledWith({
      where: { grupoEconomicoId: 'g', deletedAt: null },
      data: {
        situacao: 'suspensa',
        limiteUsuarios: 5,
        testeExpiraEm: null,
        updatedBy: 'admin',
      },
    });
    expect(tx.assinatura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { grupoEconomicoId: 'g' } }),
    );
  });
});
