import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IntegracaoClientesAlteracoesService } from './integracao-clientes-alteracoes.service';

/** Confirmação do envio de cliente ao ERP: a inclusão devolve chave e codigoErp. */
describe('IntegracaoClientesAlteracoesService.marcarAplicada', () => {
  const montar = (item: unknown, duplicado: unknown = null) => {
    const tx = {
      clienteEnvioErp: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockResolvedValue({
          id: 'i1',
          situacao: 'enviado',
          enviadoEm: new Date('2026-11-06T12:00:00Z'),
        }),
      },
      cliente: {
        findFirst: jest.fn().mockResolvedValue(duplicado),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const servico = new IntegracaoClientesAlteracoesService(prisma as never);
    return { servico, tx };
  };

  const inclusao = {
    id: 'i1',
    situacao: 'pendente',
    operacao: 'incluir',
    clienteId: 'c1',
  };

  it('inclusão grava chave e codigoErp no cliente e tira o item da fila', async () => {
    const { servico, tx } = montar(inclusao);
    const r = await servico.marcarAplicada('e1', 'i1', {
      chave: '-000123-01',
      codigoErp: '00012301',
    });
    expect(tx.cliente.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { chave: '-000123-01', codigoErp: '00012301' },
    });
    expect(r.situacao).toBe('enviado');
  });

  it('inclusão sem chave ou sem codigoErp é recusada e o item segue pendente', async () => {
    const { servico, tx } = montar(inclusao);
    await expect(
      servico.marcarAplicada('e1', 'i1', { codigoErp: '00012301' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servico.marcarAplicada('e1', 'i1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.clienteEnvioErp.update).not.toHaveBeenCalled();
  });

  it('chave que já é de outro cliente dá 409 e não grava nada', async () => {
    const { servico, tx } = montar(inclusao, { id: 'outro' });
    await expect(
      servico.marcarAplicada('e1', 'i1', { chave: '-1-01', codigoErp: '101' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.clienteEnvioErp.update).not.toHaveBeenCalled();
  });

  it('alteração ignora o corpo e não mexe no cadastro', async () => {
    const { servico, tx } = montar({ ...inclusao, operacao: 'alterar' });
    await servico.marcarAplicada('e1', 'i1', { chave: 'x', codigoErp: 'y' });
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.clienteEnvioErp.update).toHaveBeenCalledTimes(1);
  });

  it('item já enviado dá 409 e inexistente dá 404', async () => {
    await expect(
      montar({ ...inclusao, situacao: 'enviado' }).servico.marcarAplicada(
        'e1',
        'i1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      montar(null).servico.marcarAplicada('e1', 'i1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
