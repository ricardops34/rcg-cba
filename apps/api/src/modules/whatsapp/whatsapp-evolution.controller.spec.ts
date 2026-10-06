import { WhatsappEvolutionController } from './whatsapp-evolution.controller';
import { EvolutionGoProvider } from './providers/evolution-go.provider';

describe('WhatsappEvolutionController — autenticação do webhook', () => {
  const controller = new WhatsappEvolutionController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const extrair = (authorization?: string) =>
    (
      controller as unknown as {
        segredoDaAutorizacao(valor?: string): string;
      }
    ).segredoDaAutorizacao(authorization);

  it('extrai a senha de Authorization Basic', () => {
    const valor = Buffer.from('webhook:segredo-forte').toString('base64');
    expect(extrair(`Basic ${valor}`)).toBe('segredo-forte');
  });

  it('mantém compatibilidade com Authorization Bearer', () => {
    expect(extrair('Bearer segredo-forte')).toBe('segredo-forte');
  });

  it('não aceita outro esquema ou valor ausente', () => {
    expect(extrair('ApiKey segredo-forte')).toBe('');
    expect(extrair()).toBe('');
  });
});

/**
 * Recebimento no formato real da 0.7.2: envelope com nomes de struct Go
 * (`Info`, `Message`) e conteúdo com os nomes do proto do WhatsApp, que
 * mantêm o `ID` maiúsculo (`key.ID`, `contextInfo.stanzaID`).
 */
describe('WhatsappEvolutionController — recebimento (formato da 0.7.2)', () => {
  const ctx = { empresaId: 'emp', sessaoId: 'sess' };
  const montar = () => {
    const conversas = {
      receber: jest.fn().mockResolvedValue({ gravada: true }),
      receberReacao: jest.fn(),
      receberEdicao: jest.fn(),
      receberExclusao: jest.fn(),
      registrarVotosEnquete: jest.fn(),
    };
    const provedores = { resultadosEnquete: jest.fn().mockResolvedValue([]) };
    const controller = new WhatsappEvolutionController(
      conversas as never,
      {} as never,
      provedores as never,
      // O provider real só para traduzir jid em telefone, que é função pura.
      new EvolutionGoProvider({} as never),
    );
    const tratar = (Message: unknown, Info: Record<string, unknown> = {}) =>
      (
        controller as unknown as {
          tratarUmaMensagem(c: unknown, b: unknown): Promise<boolean>;
        }
      ).tratarUmaMensagem(ctx, {
        Info: {
          ID: '3EB0NOVA',
          Chat: '5565999990000@s.whatsapp.net',
          Sender: '5565999990000@s.whatsapp.net',
          IsFromMe: false,
          PushName: 'Cliente',
          ...Info,
        },
        Message,
      });
    return { conversas, provedores, tratar };
  };

  it('seleção de lista vira "resposta" ligada à mensagem de origem', async () => {
    const { conversas, tratar } = montar();
    await tratar({
      listResponseMessage: {
        title: 'Financeiro',
        singleSelectReply: { selectedRowID: 'op-1234abcd' },
        contextInfo: { stanzaID: '3EB0LISTA' },
      },
    });
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        externoId: '3EB0NOVA',
        tipo: 'resposta',
        texto: 'Financeiro',
        respondeuA: '3EB0LISTA',
        interativo: {
          tipo: 'resposta',
          escolhaId: 'op-1234abcd',
          escolhaTexto: 'Financeiro',
          origemExternoId: '3EB0LISTA',
        },
      }),
    );
  });

  it('clique em botão nativo lê o paramsJSON', async () => {
    const { conversas, tratar } = montar();
    await tratar({
      interactiveResponseMessage: {
        body: { text: 'Vendas' },
        nativeFlowResponseMessage: {
          name: 'quick_reply',
          paramsJSON: '{"id":"op-vendas","display_text":"Vendas"}',
        },
        contextInfo: { stanzaID: '3EB0BOTOES' },
      },
    });
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'resposta',
        texto: 'Vendas',
        interativo: expect.objectContaining({ escolhaId: 'op-vendas' }),
      }),
    );
  });

  it('citação comum é lida em stanzaID (maiúsculo)', async () => {
    const { conversas, tratar } = montar();
    await tratar({
      extendedTextMessage: {
        text: 'respondendo',
        contextInfo: { stanzaID: '3EB0CITADA' },
      },
    });
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'texto', respondeuA: '3EB0CITADA' }),
    );
  });

  it('reação é lida em key.ID', async () => {
    const { conversas, tratar } = montar();
    await tratar({ reactionMessage: { key: { ID: '3EB0ALVO' }, text: '👍' } });
    expect(conversas.receberReacao).toHaveBeenCalledWith(
      expect.objectContaining({ alvoExternoId: '3EB0ALVO', emoji: '👍' }),
    );
    expect(conversas.receber).not.toHaveBeenCalled();
  });

  it('exclusão (REVOKE sem tipo, por omitempty) só marca a original', async () => {
    const { conversas, tratar } = montar();
    await tratar({ protocolMessage: { key: { ID: '3EB0APAGADA' } } });
    expect(conversas.receberExclusao).toHaveBeenCalledWith(
      expect.objectContaining({ alvoExternoId: '3EB0APAGADA' }),
    );
    expect(conversas.receber).not.toHaveBeenCalled();
  });

  it('edição embrulhada em editedMessage troca o texto da original', async () => {
    const { conversas, tratar } = montar();
    await tratar({
      editedMessage: {
        message: {
          protocolMessage: {
            type: 14,
            key: { ID: '3EB0EDITADA' },
            editedMessage: { conversation: 'texto corrigido' },
          },
        },
      },
    });
    expect(conversas.receberEdicao).toHaveBeenCalledWith(
      expect.objectContaining({
        alvoExternoId: '3EB0EDITADA',
        novoTexto: 'texto corrigido',
      }),
    );
  });

  it('protocolMessage de controle não vira bolha', async () => {
    const { conversas, tratar } = montar();
    const gravou = await tratar({
      protocolMessage: { type: 3, key: { ID: 'x' }, ephemeralExpiration: 86400 },
    });
    expect(gravou).toBe(false);
    expect(conversas.receber).not.toHaveBeenCalled();
    expect(conversas.receberExclusao).not.toHaveBeenCalled();
  });

  it('enquete criada no celular entra com as opções', async () => {
    const { conversas, tratar } = montar();
    await tratar(
      {
        pollCreationMessageV3: {
          name: 'Horário?',
          options: [{ optionName: 'Manhã' }, { optionName: 'Tarde' }],
          selectableOptionsCount: 1,
        },
      },
      { IsFromMe: true },
    );
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'enquete',
        minha: true,
        interativo: {
          tipo: 'enquete',
          pergunta: 'Horário?',
          opcoes: ['Manhã', 'Tarde'],
          maxRespostas: 1,
        },
      }),
    );
  });
});
