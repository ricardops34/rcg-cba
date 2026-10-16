import { ParametrosService } from './parametros.service';
import { ParametrosCifragemService } from './parametros-cifragem.service';
import {
  PREFIXO_CIFRADO,
  abrirParametro,
  cifrarParametro,
} from './parametros-cripto';

const CHAVE = Buffer.alloc(32, 7).toString('base64');
const user = { id: 'u1' } as never;

beforeAll(() => {
  process.env.PARAMETROS_CRYPTO_KEY = CHAVE;
});
afterAll(() => {
  delete process.env.PARAMETROS_CRYPTO_KEY;
});

function montar(atual: Record<string, unknown> | null) {
  const tx = {
    parametroEmpresa: {
      findFirst: jest.fn().mockResolvedValue(atual),
      create: jest.fn(({ data }) => Promise.resolve({ ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ ...atual, ...data })),
    },
  };
  const prisma = {
    withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const gravado = (op: 'create' | 'update' = 'update') =>
    (
      tx.parametroEmpresa[op].mock.calls[0][0] as {
        data: { conteudo: string | null };
      }
    ).data.conteudo;
  return { service: new ParametrosService(prisma as never), gravado };
}

describe('ParametrosService — parâmetro de tipo senha', () => {
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

  it('trocar o tipo com conteúdo novo grava só o novo, em claro', async () => {
    const { service, gravado } = montar(smtp);

    await service.update('e1', user, 'p1', {
      tipo: 'texto',
      conteudo: 'novo',
    });

    expect(gravado()).toBe('novo');
  });

  it('cria e altera senha cifrada; a resposta não mostra o conteúdo', async () => {
    const criar = montar(null);
    const r = await criar.service.create('e1', user, {
      parametro: 'SMS_TOKEN',
      tipo: 'senha',
      conteudo: 'sk_live_x',
      ativo: true,
    });
    expect(criar.gravado('create')).toMatch(new RegExp(`^${PREFIXO_CIFRADO}`));
    expect(abrirParametro(criar.gravado('create')!)).toBe('sk_live_x');
    expect(r.conteudo).toBeNull();

    const alterar = montar(smtp);
    await alterar.service.update('e1', user, 'p1', { conteudo: 'outra' });
    expect(abrirParametro(alterar.gravado()!)).toBe('outra');
  });

  it('conteúdo vazio mantém a senha atual — cifrando a que estava em claro, sem cifrar duas vezes', async () => {
    const emClaro = montar(smtp);
    await emClaro.service.update('e1', user, 'p1', { descricao: 'x' });
    expect(abrirParametro(emClaro.gravado()!)).toBe('segredo-gravado');

    const jaCifrado = cifrarParametro('segredo-gravado');
    const cifrado = montar({ ...smtp, conteudo: jaCifrado });
    await cifrado.service.update('e1', user, 'p1', { descricao: 'x' });
    expect(cifrado.gravado()).toBe(jaCifrado);
  });
});

describe('ParametrosService.obterTexto — leitura de segredo', () => {
  const ler = (conteudo: string | null) =>
    montar({ conteudo }).service.obterTexto('e1', 'SMTP_SENHA');

  it('decifra o cifrado e aceita o texto puro de antes da cifragem', async () => {
    expect(await ler(cifrarParametro('abc'))).toBe('abc');
    expect(await ler('legado')).toBe('legado');
  });

  it('segredo que não decifra vira vazio em vez de derrubar quem lê', async () => {
    const guardado = cifrarParametro('abc');
    process.env.PARAMETROS_CRYPTO_KEY = Buffer.alloc(32, 9).toString('base64');
    try {
      expect(await ler(guardado)).toBeNull();
    } finally {
      process.env.PARAMETROS_CRYPTO_KEY = CHAVE;
    }
  });
});

describe('ParametrosCifragemService — cifra na subida o que está em claro', () => {
  function montarVarredura(linhas: { id: string; conteudo: string }[]) {
    const tx = {
      parametroEmpresa: {
        findMany: jest.fn().mockResolvedValue(linhas),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      empresa: { findMany: jest.fn().mockResolvedValue([{ id: 'e1' }]) },
    };
    const prisma = {
      withSistema: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return { service: new ParametrosCifragemService(prisma as never), tx };
  }

  it('cifra só o que está em claro, condicionado ao valor lido', async () => {
    const { service, tx } = montarVarredura([
      { id: 'a', conteudo: 'em-claro' },
      { id: 'b', conteudo: cifrarParametro('ja') },
    ]);

    expect(await service.cifrarExistentes()).toBe(1);
    expect(tx.parametroEmpresa.updateMany).toHaveBeenCalledTimes(1);
    const chamadas = tx.parametroEmpresa.updateMany.mock.calls as unknown as [
      {
        where: { id: string; conteudo: string };
        data: { conteudo: string };
      },
    ][];
    const args = chamadas[0][0];
    expect(args.where).toEqual({ id: 'a', conteudo: 'em-claro' });
    expect(abrirParametro(args.data.conteudo)).toBe('em-claro');
  });

  it('sem a chave mestra, não toca em nada', async () => {
    const { service, tx } = montarVarredura([{ id: 'a', conteudo: 'x' }]);

    expect(await service.cifrarExistentes({})).toBe(0);
    expect(tx.empresa.findMany).not.toHaveBeenCalled();
  });
});

describe('ParametrosService — chave do parâmetro', () => {
  const atual = {
    id: 'p1',
    empresaId: 'e1',
    parametro: 'SMTP_HOST',
    tipo: 'texto',
    tamanho: 120,
    conteudo: 'smtp.exemplo.com',
  };

  it('não renomeia a chave pelo PATCH (reenviar a mesma é aceito)', async () => {
    await expect(
      montar(atual).service.update('e1', user, 'p1', { parametro: 'OUTRA' }),
    ).rejects.toThrow(/não pode ser alterada/);

    const mesma = montar(atual);
    await mesma.service.update('e1', user, 'p1', {
      parametro: 'SMTP_HOST',
      conteudo: 'novo.exemplo.com',
    });
    expect(mesma.gravado()).toBe('novo.exemplo.com');
  });

  it('recriar uma chave excluída reativa a linha em vez de dar 500', async () => {
    const { service, gravado } = montar({
      id: 'p1',
      deletedAt: new Date('2026-10-01'),
    });

    await service.create('e1', user, {
      parametro: 'SMTP_HOST',
      tipo: 'texto',
      conteudo: 'smtp.novo.com',
      ativo: true,
    });

    expect(gravado()).toBe('smtp.novo.com');
  });

  it('chave viva repetida continua recusada', async () => {
    await expect(
      montar({ id: 'p1', deletedAt: null }).service.create('e1', user, {
        parametro: 'SMTP_HOST',
        tipo: 'texto',
        ativo: true,
      }),
    ).rejects.toThrow(/Já existe/);
  });
});
