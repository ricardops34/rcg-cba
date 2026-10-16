import { BadRequestException } from '@nestjs/common';
import { planoCreateSchema, planoUpdateSchema } from '@plataforma/contracts';
import { PlanosService } from './planos.service';

describe('Planos', () => {
  it('o corpo é validado pelo contrato, e o PATCH parcial não zera as listas', () => {
    expect(
      planoCreateSchema.safeParse({ nome: 'X', codigo: 'x', valorMensal: 'a' })
        .success,
    ).toBe(false);
    // Sem o Zod, `deletedAt` chegava ao Prisma; com ele, campo desconhecido sai.
    expect(
      planoUpdateSchema.parse({ nome: 'Novo', deletedAt: '2026-01-01' }),
    ).toEqual({ nome: 'Novo' });
  });

  it('código usado por plano excluído é recusado com 400, não 500', async () => {
    const prisma = {
      plano: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ deletedAt: new Date('2026-01-01') }),
      },
    };
    await expect(
      new PlanosService(prisma as never).createPlano(
        planoCreateSchema.parse({ nome: 'X', codigo: 'x', valorMensal: 1 }),
        'u',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a exclusão conta só contratos de grupos vivos', async () => {
    const prisma = {
      assinatura: { count: jest.fn().mockResolvedValue(0) },
      plano: { update: jest.fn() },
    };
    await new PlanosService(prisma as never).removePlano('p', 'u');

    expect(prisma.assinatura.count).toHaveBeenCalledWith({
      where: {
        planoId: 'p',
        grupoEconomicoId: { not: null },
        grupoEconomico: { deletedAt: null },
      },
    });
    expect(prisma.plano.update).toHaveBeenCalled();
  });

  it('devolve os quatro valores como número', async () => {
    const plano = {
      id: 'p',
      valorMensal: '10',
      valorTrimestral: '27',
      valorSemestral: '50',
      valorAnual: '90',
      modulos: [],
      menus: [],
      rotinas: [],
    };
    const prisma = { plano: { findFirst: jest.fn().mockResolvedValue(plano) } };

    expect(
      await new PlanosService(prisma as never).getPlano('p'),
    ).toMatchObject({
      valorMensal: 10,
      valorTrimestral: 27,
      valorSemestral: 50,
      valorAnual: 90,
    });
  });
});
