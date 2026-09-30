import { garantirVagaDeEmpresa } from './limite-empresas';
import type { TenantTx } from '../prisma/prisma.service';

describe('limite de empresas do plano do grupo', () => {
  function setup(total = 2, limite = 3, situacao = 'ativa') {
    const assinatura = {
      situacao,
      plano: { nome: 'Grupo', limiteEmpresas: limite, deletedAt: null },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'g' }]),
      assinatura: { findUnique: jest.fn().mockResolvedValue(assinatura) },
      empresa: { count: jest.fn().mockResolvedValue(total) },
    };
    return {
      tx,
      check: (apos?: number) =>
        garantirVagaDeEmpresa(tx as unknown as TenantTx, 'g', apos),
    };
  }
  it('aceita a última vaga e bloqueia ao atingir o teto', async () => {
    const { check, tx } = setup();
    await expect(check()).resolves.toBeDefined();
    tx.empresa.count.mockResolvedValue(3);
    await expect(check()).rejects.toThrow('permite 3 empresa(s)');
    expect(tx.empresa.count).toHaveBeenCalledWith({
      where: { grupoEconomicoId: 'g', deletedAt: null },
    });
  });
  it('trava o grupo antes de consultar plano e contar empresas', async () => {
    const { check, tx } = setup();
    await check();
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.assinatura.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.assinatura.findUnique).toHaveBeenCalledWith({
      where: { grupoEconomicoId: 'g' },
      include: { plano: true },
    });
  });
  it.each(['suspensa', 'cancelada', 'atrasada'])(
    'não permite contratar empresas com assinatura %s',
    async (situacao) => {
      await expect(setup(1, 3, situacao).check()).rejects.toThrow(
        'plano contratado ativo',
      );
    },
  );
  it('não concede plano implicitamente se o grupo não tem contrato', async () => {
    const { check, tx } = setup();
    tx.assinatura.findUnique.mockResolvedValue(null);
    await expect(check()).rejects.toThrow('plano contratado ativo');
  });
  it('valida também a inclusão de empresas existentes', async () => {
    const { check } = setup(2, 3);
    await expect(check(4)).rejects.toThrow('permite 3');
    await expect(check(3)).resolves.toBeDefined();
  });
  it('plano reduzido preserva as empresas mas bloqueia novas', async () => {
    await expect(setup(5, 2).check()).rejects.toThrow('grupo já possui 5');
  });
});
