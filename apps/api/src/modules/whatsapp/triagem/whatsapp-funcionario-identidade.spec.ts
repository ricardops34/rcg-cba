import { WhatsappFuncionarioService } from './whatsapp-funcionario.service';
import type { TenantTx } from '../../../common/prisma/prisma.service';

describe('WhatsApp pessoal do usuário', () => {
  function setup(
    candidatos: { usuarioId: string; nome: string; celular: string }[],
  ) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(candidatos),
      whatsappVinculoFuncionario: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'v', confirmadoEm: null, validoAte: null }),
      },
      vendedor: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
      },
    };
    const service = new WhatsappFuncionarioService({} as never);
    return {
      tx,
      identificar: (numero: string) =>
        service.identificar(tx as unknown as TenantTx, 'empresa', numero),
    };
  }
  const pessoa = { usuarioId: 'u', nome: 'Ana', celular: '(65) 99999-1234' };
  it('reconhece o número do perfil e pede confirmação', async () => {
    const { identificar, tx } = setup([pessoa]);
    expect(await identificar('5565999991234')).toMatchObject({
      tipo: 'funcionario_pendente',
      usuarioId: 'u',
    });
    expect(tx.whatsappVinculoFuncionario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ empresaId: 'empresa', usuarioId: 'u' }),
      }),
    );
  });
  it('não reconhece outro DDD com o mesmo sufixo', async () => {
    const { identificar, tx } = setup([pessoa]);
    expect(await identificar('5511999991234')).toEqual({
      tipo: 'desconhecido',
    });
    expect(tx.whatsappVinculoFuncionario.create).not.toHaveBeenCalled();
  });
  it('não escolhe um usuário quando o número está duplicado', async () => {
    const { identificar } = setup([pessoa, { ...pessoa, usuarioId: 'outro' }]);
    expect(await identificar('5565999991234')).toEqual({
      tipo: 'desconhecido',
    });
  });
  it('identifica usuário confirmado sem cadastro de vendedor', async () => {
    const { identificar, tx } = setup([pessoa]);
    tx.whatsappVinculoFuncionario.findUnique.mockResolvedValue({
      id: 'v',
      usuarioId: 'u',
      confirmadoEm: new Date(),
      validoAte: new Date(Date.now() + 60_000),
    });
    expect(await identificar('5565999991234')).toMatchObject({
      tipo: 'funcionario',
      usuarioId: 'u',
      vendedorId: null,
    });
  });
});
