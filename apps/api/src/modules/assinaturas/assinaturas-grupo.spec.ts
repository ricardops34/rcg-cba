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
});

describe('alteração da assinatura propaga às empresas só o que mudou', () => {
  function montar(
    atual: { planoId: string; situacao: string } | null,
    situacaoGravada: string,
  ) {
    const tx = {
      $queryRaw: jest.fn(),
      grupoEconomico: { findFirst: jest.fn().mockResolvedValue({ id: 'g' }) },
      assinatura: {
        findUnique: jest.fn().mockResolvedValue(atual),
        upsert: jest.fn().mockResolvedValue({
          situacao: situacaoGravada,
          valorMensalidade: 100,
        }),
      },
      plano: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({
            id: where.id,
            ativo: true,
            valorMensal: 100,
            limiteUsuarios: where.id === 'grande' ? 20 : 5,
          }),
        ),
      },
      empresa: { updateMany: jest.fn() },
    };
    const service = new AssinaturasService({
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    } as never);
    return { service, tx };
  }
  const where = { grupoEconomicoId: 'g', deletedAt: null };

  it('situação alterada: aplica a situação (atrasada suspende), sem mexer no limite', async () => {
    const { service, tx } = montar(
      { planoId: 'p', situacao: 'ativa' },
      'atrasada',
    );
    await service.updateAssinaturaGrupo('g', { situacao: 'atrasada' }, 'admin');
    expect(tx.empresa.updateMany).toHaveBeenCalledWith({
      where,
      data: { situacao: 'suspensa', testeExpiraEm: null, updatedBy: 'admin' },
    });
    expect(tx.assinatura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { grupoEconomicoId: 'g' } }),
    );
  });

  it('plano trocado: aplica o limite de usuários do plano novo, sem mexer na situação', async () => {
    const { service, tx } = montar(
      { planoId: 'p', situacao: 'ativa' },
      'ativa',
    );
    await service.updateAssinaturaGrupo('g', { planoId: 'grande' }, 'admin');
    expect(tx.empresa.updateMany).toHaveBeenCalledWith({
      where,
      data: { limiteUsuarios: 20, updatedBy: 'admin' },
    });
  });

  it('a tela reenvia a mesma situação com o novo vencimento: as empresas ficam como estão', async () => {
    const { service, tx } = montar(
      { planoId: 'p', situacao: 'ativa' },
      'ativa',
    );
    await service.updateAssinaturaGrupo(
      'g',
      { planoId: 'p', situacao: 'ativa', diaVencimento: 15 },
      'admin',
    );
    expect(tx.empresa.updateMany).not.toHaveBeenCalled();
  });

  it('só o dia de vencimento: as empresas ficam como estão', async () => {
    const { service, tx } = montar(
      { planoId: 'p', situacao: 'ativa' },
      'ativa',
    );
    await service.updateAssinaturaGrupo('g', { diaVencimento: 15 }, 'admin');
    expect(tx.empresa.updateMany).not.toHaveBeenCalled();
  });

  it('contrato novo: aplica situação e limite', async () => {
    const { service, tx } = montar(null, 'ativa');
    await service.updateAssinaturaGrupo('g', { planoId: 'p' }, 'admin');
    expect(tx.empresa.updateMany).toHaveBeenCalledWith({
      where,
      data: {
        situacao: 'ativa',
        testeExpiraEm: null,
        limiteUsuarios: 5,
        updatedBy: 'admin',
      },
    });
  });
});
