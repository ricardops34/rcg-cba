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

describe('WhatsappEvolutionController — HistorySync (formato whatsmeow)', () => {
  const montar = (historicoDias: number) => {
    const conversas = {
      receber: jest.fn().mockResolvedValue({ gravada: true }),
      completarNomesPelaAgenda: jest.fn().mockResolvedValue({ atualizados: 0 }),
      aplicarApelidos: jest.fn().mockResolvedValue({ atualizados: 0 }),
    };
    const controller = new WhatsappEvolutionController(
      conversas as never,
      {} as never,
      {} as never,
      new EvolutionGoProvider({} as never),
    );
    const tratar = (corpo: unknown) =>
      (
        controller as unknown as {
          tratarHistorico(c: unknown, b: unknown): { tratado: boolean };
        }
      ).tratarHistorico(
        { empresaId: 'emp', sessaoId: 'sess', config: { historicoDias } },
        corpo,
      );
    return { conversas, tratar };
  };

  const agora = Math.floor(Date.now() / 1000);
  const pacote = {
    event: 'HistorySync',
    data: {
      Data: {
        syncType: 'RECENT',
        conversations: [
          {
            ID: '5565999990000@s.whatsapp.net',
            messages: [
              {
                message: {
                  key: { remoteJID: '5565999990000@s.whatsapp.net', fromMe: false, ID: 'H-RECENTE' },
                  message: { conversation: 'de ontem' },
                  messageTimestamp: agora - 86400,
                  pushName: 'Cliente',
                },
              },
              {
                message: {
                  key: { remoteJID: '5565999990000@s.whatsapp.net', fromMe: true, ID: 'H-ANTIGA' },
                  message: { conversation: 'de dois meses atrás' },
                  messageTimestamp: agora - 60 * 86400,
                },
              },
            ],
          },
        ],
      },
    },
  };

  it('grava só o que cabe nos dias de histórico, com a data original', async () => {
    const { conversas, tratar } = montar(30);
    expect(tratar(pacote).tratado).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(conversas.receber).toHaveBeenCalledTimes(1);
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        externoId: 'H-RECENTE',
        texto: 'de ontem',
        historico: true,
        criadaEm: new Date((agora - 86400) * 1000),
      }),
    );
  });

  it('com zero dias, nada entra', () => {
    const { conversas, tratar } = montar(0);
    expect(tratar(pacote).tratado).toBe(false);
    expect(conversas.receber).not.toHaveBeenCalled();
  });
});

describe('WhatsappEvolutionController — HistorySync com @lid', () => {
  it('tira telefone e nome do próprio pacote', async () => {
    const conversas = {
      receber: jest.fn().mockResolvedValue({ gravada: true }),
      completarNomesPelaAgenda: jest.fn().mockResolvedValue({ atualizados: 0 }),
      aplicarApelidos: jest.fn().mockResolvedValue({ atualizados: 0 }),
    };
    const controller = new WhatsappEvolutionController(
      conversas as never,
      {} as never,
      {} as never,
      new EvolutionGoProvider({} as never),
    );
    const agora = Math.floor(Date.now() / 1000);
    (
      controller as unknown as {
        tratarHistorico(c: unknown, b: unknown): unknown;
      }
    ).tratarHistorico(
      { empresaId: 'emp', sessaoId: 'sess', config: { historicoDias: 30 } },
      {
        event: 'HistorySync',
        data: {
          Data: {
            phoneNumberToLidMappings: [
              { pnJID: '5567999998888@s.whatsapp.net', lidJID: '237298118@lid' },
            ],
            pushnames: [{ ID: '237298118@lid', pushname: 'Edinho' }],
            conversations: [
              {
                ID: '237298118@lid',
                name: 'Edson Gomes Barbosa',
                messages: [
                  {
                    message: {
                      key: { remoteJID: '237298118@lid', fromMe: false, ID: 'H-LID' },
                      message: { ephemeralMessage: { message: { conversation: 'Kkkkk' } } },
                      messageTimestamp: agora - 3600,
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        jid: '237298118@lid',
        // Nome da agenda vence o apelido; telefone vem do mapeamento.
        nomeExibicao: 'Edson Gomes Barbosa',
        telefone: '5567999998888',
        // A mensagem temporária é desembrulhada.
        texto: 'Kkkkk',
        tipo: 'texto',
      }),
    );
  });
});

describe('WhatsappEvolutionController — roteamento de eventos da 0.7.2', () => {
  const controller = new WhatsappEvolutionController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const rota = (event: string) =>
    (
      controller as unknown as { nomeDoEvento(c: unknown): string | null }
    ).nomeDoEvento({ event });

  it('Connected volta a conexão (era descartado e a sessão ficava desconectada)', () => {
    expect(rota('Connected')).toBe('conexao');
    expect(rota('Disconnected')).toBe('conexao');
    expect(rota('PairSuccess')).toBe('conexao');
    expect(rota('LoggedOut')).toBe('conexao');
    expect(rota('TemporaryBan')).toBe('conexao');
    expect(rota('ConnectFailure')).toBe('conexao');
  });

  it('demais eventos vão para o tratamento certo', () => {
    expect(rota('Message')).toBe('mensagem');
    expect(rota('Receipt')).toBe('recibo');
    expect(rota('HistorySync')).toBe('historico');
    expect(rota('PushName')).toBe('apelido');
    expect(rota('ButtonClick')).toBeNull();
    expect(rota('OfflineSyncCompleted')).toBeNull();
  });
});

describe('WhatsappEvolutionController — mensagem de empresa (modelo com botões)', () => {
  it('vira "botoes" com o texto e os botões, e o nome verificado vence o apelido', async () => {
    const conversas = { receber: jest.fn().mockResolvedValue({ gravada: true }) };
    const controller = new WhatsappEvolutionController(
      conversas as never,
      {} as never,
      {} as never,
      new EvolutionGoProvider({} as never),
    );
    await (
      controller as unknown as {
        tratarUmaMensagem(c: unknown, b: unknown): Promise<boolean>;
      }
    ).tratarUmaMensagem(
      { empresaId: 'emp', sessaoId: 'sess' },
      {
        Info: {
          ID: 'PANAN-1',
          Chat: '271562628427859@lid',
          Sender: '271562628427859@lid',
          IsFromMe: false,
          PushName: 'Panan',
          VerifiedName: { Details: { verifiedName: 'Panan Refrigeração' } },
        },
        Message: {
          templateMessage: {
            hydratedTemplate: {
              hydratedContentText: 'Olá, Ana. Podemos agendar?',
              hydratedButtons: [
                { quickReplyButton: { displayText: 'Sim, vamos agendar!' } },
                { quickReplyButton: { displayText: 'Já troquei o meu!' } },
              ],
            },
          },
        },
      },
    );
    expect(conversas.receber).toHaveBeenCalledWith(
      expect.objectContaining({
        nomeExibicao: 'Panan Refrigeração',
        tipo: 'botoes',
        interativo: {
          tipo: 'botoes',
          texto: 'Olá, Ana. Podemos agendar?',
          botoes: [
            { tipo: 'resposta', texto: 'Sim, vamos agendar!' },
            { tipo: 'resposta', texto: 'Já troquei o meu!' },
          ],
        },
      }),
    );
  });
});
