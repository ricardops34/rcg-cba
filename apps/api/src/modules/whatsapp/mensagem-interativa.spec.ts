import { whatsappInterativoSchema } from '@plataforma/contracts';
import {
  assinarInterativo,
  prepararInterativo,
  resumoInterativo,
} from './mensagem-interativa';
import { EvolutionGoProvider } from './providers/evolution-go.provider';
import type { EvolutionGoClient } from './providers/evolution-go.client';

describe('mensagens interativas', () => {
  it('gera id para botão de resposta e linha de lista, e preserva o informado', () => {
    const botoes = prepararInterativo({
      tipo: 'botoes',
      texto: 'Como ajudar?',
      botoes: [
        { tipo: 'resposta', texto: 'Vendas' },
        { tipo: 'resposta', texto: 'Suporte', id: 'suporte' },
      ],
    });
    if (botoes.tipo !== 'botoes') throw new Error();
    const [vendas, suporte] = botoes.botoes;
    expect(vendas.tipo === 'resposta' && vendas.id).toMatch(/^op-[0-9a-f]{8}$/);
    expect(suporte.tipo === 'resposta' && suporte.id).toBe('suporte');

    const lista = prepararInterativo({
      tipo: 'lista',
      texto: 'Escolha',
      textoBotao: 'Ver',
      secoes: [{ titulo: 'A', linhas: [{ titulo: 'Um' }] }],
    });
    if (lista.tipo !== 'lista') throw new Error();
    expect(lista.secoes[0].linhas[0].id).toMatch(/^op-/);
  });

  it('assina só onde há texto livre', () => {
    expect(
      assinarInterativo('Ana', { tipo: 'link', texto: 'https://x.com' }),
    ).toEqual({ tipo: 'link', texto: '*Ana:*\nhttps://x.com' });
    const enquete = {
      tipo: 'enquete' as const,
      pergunta: 'Qual?',
      opcoes: ['a', 'b'],
      maxRespostas: 1,
    };
    expect(assinarInterativo('Ana', enquete)).toBe(enquete);
  });

  it('resume em texto legível para prévia, busca e agente', () => {
    expect(
      resumoInterativo({
        tipo: 'botoes',
        texto: 'Pague por aqui',
        botoes: [{ tipo: 'pix', nome: 'RCG', tipoChave: 'cnpj', chave: '1' }],
      }),
    ).toBe('Pague por aqui\n[PIX RCG]');
  });

  it('o contrato barra o que a 0.7.2 recusa', () => {
    const erro = (x: unknown) => {
      const r = whatsappInterativoSchema.safeParse(x);
      return r.success ? null : r.error.issues[0].message;
    };
    expect(
      erro({
        tipo: 'botoes',
        texto: 'x',
        botoes: [
          { tipo: 'pix', nome: 'A', tipoChave: 'cpf', chave: '1' },
          { tipo: 'url', texto: 'Site', url: 'https://a.b' },
        ],
      }),
    ).toBe('O botão PIX vai sozinho');
    expect(
      erro({
        tipo: 'lista',
        texto: 'x',
        secoes: [
          {
            titulo: 'S',
            linhas: Array.from({ length: 11 }, (_, i) => ({ titulo: `L${i}` })),
          },
        ],
      }),
    ).toBe('No máximo 10 opções somando todas as seções');
  });
});

describe('EvolutionGoProvider.enviarInterativo — nomes de campo da 0.7.2', () => {
  const enviar = async (mensagem: unknown) => {
    const chamar = jest
      .fn()
      .mockResolvedValue({ data: { Info: { ID: '3EB0INTER' } } });
    const provider = new EvolutionGoProvider({
      chamar,
    } as unknown as EvolutionGoClient);
    await provider.enviarInterativo(
      {
        config: { evolutionUrl: 'http://gw' },
        instancia: { token: 't' },
      } as never,
      { jid: '5511999998888@s.whatsapp.net', mensagem: mensagem as never },
    );
    const [, rota, { corpo }] = chamar.mock.calls[0];
    return { rota, corpo };
  };

  it('botões vão para /send/button sem rodapé vazio', async () => {
    const { rota, corpo } = await enviar({
      tipo: 'botoes',
      texto: 'Canais',
      botoes: [
        { tipo: 'url', texto: 'Site', url: 'https://a.b' },
        { tipo: 'ligar', texto: 'Ligar', telefone: '+5511999998888' },
        { tipo: 'copiar', texto: 'Cupom', codigo: 'X10' },
      ],
    });
    expect(rota).toBe('/send/button');
    expect(corpo).toEqual({
      number: '5511999998888',
      description: 'Canais',
      buttons: [
        { type: 'url', displayText: 'Site', url: 'https://a.b' },
        { type: 'call', displayText: 'Ligar', phoneNumber: '+5511999998888' },
        { type: 'copy', displayText: 'Cupom', copyCode: 'X10' },
      ],
    });
  });

  it('lista usa rowId, buttonText e footerText', async () => {
    const { rota, corpo } = await enviar({
      tipo: 'lista',
      texto: 'Escolha',
      textoBotao: 'Ver',
      rodape: 'RCG',
      secoes: [{ titulo: 'A', linhas: [{ titulo: 'Um', id: 'um' }] }],
    });
    expect(rota).toBe('/send/list');
    expect(corpo).toMatchObject({
      buttonText: 'Ver',
      footerText: 'RCG',
      sections: [{ title: 'A', rows: [{ title: 'Um', rowId: 'um' }] }],
    });
  });

  it('enquete, localização, contato e link', async () => {
    expect(
      await enviar({ tipo: 'enquete', pergunta: 'Q', opcoes: ['a', 'b'], maxRespostas: 1 }),
    ).toEqual({
      rota: '/send/poll',
      corpo: { number: '5511999998888', question: 'Q', options: ['a', 'b'], maxAnswer: 1 },
    });
    expect(
      (await enviar({ tipo: 'localizacao', nome: 'Loja', endereco: 'Rua 1', latitude: -15.6, longitude: -56.1 })).rota,
    ).toBe('/send/location');
    expect(
      (await enviar({ tipo: 'contato', nome: 'Ana', telefone: '+55 65 99999-0000'.replace(/\D/g, '') })).corpo,
    ).toMatchObject({ vcard: { fullName: 'Ana', phone: '5565999990000' } });
    expect((await enviar({ tipo: 'link', texto: 'veja https://x.com' })).corpo).toEqual({
      number: '5511999998888',
      text: 'veja https://x.com',
    });
  });
});

describe('EvolutionGoProvider — editar, apagar e presença (0.7.2)', () => {
  const chamarCom = async (
    acao: (p: EvolutionGoProvider) => Promise<unknown>,
  ) => {
    const chamar = jest.fn().mockResolvedValue({});
    await acao(new EvolutionGoProvider({ chamar } as unknown as EvolutionGoClient));
    const [, rota, { corpo }] = chamar.mock.calls[0];
    return { rota, corpo };
  };
  const ctx = { config: { evolutionUrl: 'http://gw' }, instancia: { token: 't' } } as never;
  const jid = '5511999998888@s.whatsapp.net';

  it('editar e apagar mandam o jid em "chat", não o número', async () => {
    expect(
      await chamarCom((p) => p.editarMensagem(ctx, { jid, externoId: 'X1', texto: 'novo' })),
    ).toEqual({ rota: '/message/edit', corpo: { chat: jid, messageId: 'X1', message: 'novo' } });
    expect(
      await chamarCom((p) => p.apagarMensagem(ctx, { jid, externoId: 'X1' })),
    ).toEqual({ rota: '/message/delete', corpo: { chat: jid, messageId: 'X1' } });
  });

  it('gravando é composing + isAudio; parou é paused', async () => {
    expect((await chamarCom((p) => p.presenca(ctx, { jid, estado: 'gravando' }))).corpo).toEqual({
      number: '5511999998888',
      state: 'composing',
      isAudio: true,
    });
    expect((await chamarCom((p) => p.presenca(ctx, { jid, estado: 'parou' }))).corpo).toMatchObject({
      state: 'paused',
      isAudio: false,
    });
  });
});
