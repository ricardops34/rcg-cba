import { ParametrosService } from './parametros.service';

const user = { id: 'u1' } as never;

function montar(atual: Record<string, unknown>) {
  const tx = {
    parametroEmpresa: {
      findFirst: jest.fn().mockResolvedValue(atual),
      update: jest.fn(({ data }) => Promise.resolve({ ...atual, ...data })),
    },
  };
  const prisma = {
    withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const gravado = () =>
    (
      tx.parametroEmpresa.update.mock.calls[0][0] as {
        data: { conteudo: unknown };
      }
    ).data.conteudo;
  return { service: new ParametrosService(prisma as never), gravado };
}

describe('ParametrosService.update — parâmetro de tipo senha', () => {
  const smtp = {
    id: 'p1',
    empresaId: 'e1',
    parametro: 'SMTP_SENHA',
    tipo: 'senha',
    tamanho: 120,
    conteudo: 'segredo-gravado',
  };

  it('trocar o tipo para texto não revela a senha gravada', async () => {
    const { service, gravado } = montar(smtp);

    const r = await service.update('e1', user, 'p1', { tipo: 'texto' });

    expect(gravado()).toBeNull();
    expect(r.conteudo).toBeNull();
  });

  it('trocar o tipo com conteúdo novo grava só o novo', async () => {
    const { service, gravado } = montar(smtp);

    await service.update('e1', user, 'p1', { tipo: 'texto', conteudo: 'novo' });

    expect(gravado()).toBe('novo');
  });

  it('continuando senha, conteúdo vazio mantém o atual e a resposta não o mostra', async () => {
    const { service, gravado } = montar(smtp);

    const r = await service.update('e1', user, 'p1', { descricao: 'x' });

    expect(gravado()).toBe('segredo-gravado');
    expect(r.conteudo).toBeNull();
    expect(r.preenchido).toBe(true);
  });
});
