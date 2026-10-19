import { BadRequestException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

const user = { id: 'u1' } as never;

function montar(opcoes: {
  cliente?: Record<string, unknown>;
  contato?: Record<string, unknown> | null;
  sincronizado?: Record<string, unknown> | null;
}) {
  const tx = {
    cliente: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c1', ...opcoes.cliente }),
    },
    clienteContato: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where.id ? (opcoes.contato ?? null) : (opcoes.sincronizado ?? null),
          ),
        ),
    },
  };
  const registrar = jest
    .fn()
    .mockResolvedValue({ resultado: 'aplicado', diff: {} });
  const servico = Object.create(ClientesService.prototype) as ClientesService;
  (servico as unknown as { alteracoes: unknown }).alteracoes = { registrar };
  return { tx, servico, registrar };
}

describe('ClientesService.contatoErpDoVinculo', () => {
  it('com os quatro vazios e sem contato, preenche o primeiro', async () => {
    const { tx, servico, registrar } = montar({
      sincronizado: {
        id: 'novo',
        nome: 'Maria',
        email: null,
        celular: '67999112233',
      },
    });
    const r = await servico.contatoErpDoVinculo(
      tx as never,
      'e1',
      user,
      'c1',
      null,
      '5567999112233',
      'Maria',
    );
    expect(registrar).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        aplicarDireto: true,
        input: {
          contato1Nome: 'Maria',
          contato1Telefone: '67999112233',
          contato1Whatsapp: true,
        },
      }),
    );
    expect(r?.id).toBe('novo');
  });

  it('com algum contato preenchido e nenhum escolhido, não adivinha', async () => {
    const { tx, servico, registrar } = montar({
      cliente: { contato2Nome: 'João' },
    });
    const r = await servico.contatoErpDoVinculo(
      tx as never,
      'e1',
      user,
      'c1',
      null,
      '5567999112233',
      'X',
    );
    expect(r).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('contato escolhido sem número recebe o número do vínculo', async () => {
    const { tx, servico, registrar } = montar({
      cliente: { contato3Nome: 'Ana' },
      contato: {
        id: 'k3',
        nome: 'Ana',
        email: null,
        celular: null,
        origem: 'erp',
        posicaoErp: 3,
      },
      sincronizado: {
        id: 'k3',
        nome: 'Ana',
        email: null,
        celular: '67988887777',
      },
    });
    await servico.contatoErpDoVinculo(
      tx as never,
      'e1',
      user,
      'c1',
      'k3',
      '5567988887777',
      null,
    );
    expect(registrar).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        input: { contato3Telefone: '67988887777', contato3Whatsapp: true },
      }),
    );
  });

  it('contato escolhido com número não é sobrescrito', async () => {
    const { tx, servico, registrar } = montar({
      cliente: { contato1Nome: 'Ana', contato1Telefone: '6733214455' },
      contato: {
        id: 'k1',
        nome: 'Ana',
        email: null,
        celular: null,
        origem: 'erp',
        posicaoErp: 1,
      },
    });
    const r = await servico.contatoErpDoVinculo(
      tx as never,
      'e1',
      user,
      'c1',
      'k1',
      '5567988887777',
      null,
    );
    expect(registrar).not.toHaveBeenCalled();
    expect(r?.id).toBe('k1');
  });

  it('contato digitado na plataforma não serve de vínculo', async () => {
    const { tx, servico } = montar({
      contato: {
        id: 'm',
        nome: 'M',
        email: 'm@x.com',
        celular: null,
        origem: 'plataforma',
        posicaoErp: null,
      },
    });
    await expect(
      servico.contatoErpDoVinculo(
        tx as never,
        'e1',
        user,
        'c1',
        'm',
        '5567988887777',
        null,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
