import { gravarWhatsappDoUsuario, normalizarWhatsapp } from './whatsapp-do-usuario';
import type { TenantTx } from '../prisma/prisma.service';

describe('WhatsApp único no grupo', () => {
  function setup(numero = '65999991234') {
    const tx = {
      usuario: { findUniqueOrThrow: jest.fn().mockResolvedValue({ celular: numero, grupoEconomicoId: 'g' }), update: jest.fn() },
      empresa: { findMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]) },
      vendedor: { updateMany: jest.fn() },
      whatsappVinculoFuncionario: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    return tx;
  }
  it('normaliza formatação e aceita remoção', () => {
    expect(normalizarWhatsapp('(65) 99999-1234')).toBe('65999991234');
    expect(normalizarWhatsapp('')).toBeNull();
  });
  it('sincroniza vendedores e invalida confirmação em cada empresa', async () => {
    const tx = setup();
    await gravarWhatsappDoUsuario(tx as unknown as TenantTx, 'u', 'e1', '(65) 98888-1234', 'admin');
    expect(tx.usuario.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { celular: '65988881234', telefone: '65988881234', updatedBy: 'admin' } });
    for (const empresaId of ['e1', 'e2']) expect(tx.vendedor.updateMany).toHaveBeenCalledWith({ where: { usuarioId: 'u', empresaId, deletedAt: null }, data: { telefone: '65988881234', updatedBy: 'admin' } });
    expect(tx.whatsappVinculoFuncionario.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls.map((c) => c[1])).toEqual(['e1', 'e2', 'e1']);
  });
  it('preserva confirmação ao mudar somente a formatação', async () => {
    const tx = setup();
    await gravarWhatsappDoUsuario(tx as unknown as TenantTx, 'u', 'e1', '(65) 99999-1234', 'u');
    expect(tx.whatsappVinculoFuncionario.deleteMany).not.toHaveBeenCalled();
  });
  it('restaura contexto de origem mesmo se sincronização falhar', async () => {
    const tx = setup();
    tx.vendedor.updateMany.mockRejectedValueOnce(new Error('falha'));
    await expect(gravarWhatsappDoUsuario(tx as unknown as TenantTx, 'u', 'e1', '', 'u')).rejects.toThrow('falha');
    expect(tx.$executeRaw.mock.calls.at(-1)?.[1]).toBe('e1');
  });
});
