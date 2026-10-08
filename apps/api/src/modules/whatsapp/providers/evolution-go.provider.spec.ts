import { BadGatewayException } from '@nestjs/common';
import { EvolutionGoProvider } from './evolution-go.provider';
import { EvolutionGoClient, EvolutionGoErroHttp } from './evolution-go.client';

describe('EvolutionGoProvider — URL do webhook', () => {
  it('não coloca o segredo na query e usa credencial HTTP', () => {
    const provider = new EvolutionGoProvider({} as never);
    const montar = (
      provider as unknown as {
        urlWebhook(
          ctx: { empresaId: string; sessaoId: string },
          segredo: string,
        ): string;
      }
    ).urlWebhook.bind(provider);

    const url = new URL(
      montar({ empresaId: 'empresa', sessaoId: 'sessao' }, 'segredo forte'),
    );
    expect(url.search).toBe('');
    expect(url.username).toBe('webhook');
    expect(url.password).toBe('segredo%20forte');
    expect(url.pathname).toBe(
      '/api/v1/whatsapp/evolution/webhook/empresa/sessao',
    );
  });
});

describe('EvolutionGoProvider — Isolamento de Chaves e Autenticação', () => {
  let mockHttp: { chamar: jest.Mock };
  let provider: EvolutionGoProvider;

  beforeEach(() => {
    mockHttp = { chamar: jest.fn() };
    provider = new EvolutionGoProvider(mockHttp as unknown as EvolutionGoClient);
  });

  it('chaveInstancia nunca retorna a chave administrativa global', () => {
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: null,
      vendedorNome: null,
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'CHAVE_ADMIN_GLOBAL_SECRETA',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'instancia_teste',
        id: 'uuid-123',
        token: null, // sem token de instância
        webhookSegredo: null,
      },
    };

    const chave = (provider as any).chaveInstancia(ctx);
    // Deve ser null para não disparar 401 no middleware Auth da Evolution GO
    expect(chave).toBeNull();
    expect(chave).not.toBe('CHAVE_ADMIN_GLOBAL_SECRETA');
  });

  it('testarGateway valida rota /server/ok e /instance/all', async () => {
    mockHttp.chamar
      .mockResolvedValueOnce({ status: 'ok' }) // /server/ok
      .mockResolvedValueOnce({ data: [{ id: '1', name: 'inst1' }, { id: '2', name: 'inst2' }] }); // /instance/all

    const res = await provider.testarGateway('http://gateway:8080', 'admin-key');
    expect(res.ok).toBe(true);
    expect(res.totalInstancias).toBe(2);
    expect(mockHttp.chamar).toHaveBeenCalledWith(
      'http://gateway:8080',
      '/server/ok',
      expect.anything(),
    );
    expect(mockHttp.chamar).toHaveBeenCalledWith(
      'http://gateway:8080',
      '/instance/all',
      expect.objectContaining({ credencial: 'admin-key' }),
    );
  });

  it('testarGateway rejeita com BadGatewayException se Evolution GO estiver inacessível', async () => {
    mockHttp.chamar.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      provider.testarGateway('http://gateway:8080', 'admin-key'),
    ).rejects.toThrow(BadGatewayException);
  });

  it('pareamento retorna estado desconectado amigável quando a instância não tem token', async () => {
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: null,
      vendedorNome: null,
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'admin-key',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'empresa_emp1_empresa',
        id: 'uuid-123',
        token: null,
        webhookSegredo: null,
      },
    };

    // /instance/all não acha o token
    mockHttp.chamar.mockResolvedValueOnce({ data: [] });

    const estado = await provider.pareamento(ctx);
    expect(estado.status).toBe('desconectada');
    expect(estado.qr).toBeNull();
    expect(estado.erro).toContain('Recomeçar pareamento');
  });

  it('pareamento continua em "pareando", sem erro, enquanto o gateway ainda gera o QR', async () => {
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: null,
      vendedorNome: null,
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'admin-key',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'empresa_emp1_empresa',
        id: 'uuid-123',
        token: 'token-ok',
        webhookSegredo: null,
      },
    };

    // /instance/status: ainda não conectado
    mockHttp.chamar.mockResolvedValueOnce({ data: { Connected: false } });
    // /instance/qr: o gateway ainda não gerou o código
    mockHttp.chamar.mockRejectedValueOnce(
      new EvolutionGoErroHttp(
        400,
        '{"error":"no QR code available. Please wait a moment and try again"}',
        'no QR code available. Please wait a moment and try again',
      ),
    );

    const estado = await provider.pareamento(ctx);
    expect(estado.status).toBe('pareando');
    expect(estado.qr).toBeNull();
    expect(estado.erro).toBeNull();
  });

  it('pareamento estoura (não diz "desconectada") quando a consulta de status falha', async () => {
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: null,
      vendedorNome: null,
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'admin-key',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'empresa_emp1_empresa',
        id: 'uuid-123',
        token: 'token-ok',
        webhookSegredo: null,
      },
    };

    // O banco do gateway sem conexões: 500 no status, 401 na busca do token.
    mockHttp.chamar.mockRejectedValueOnce(
      new EvolutionGoErroHttp(500, 'too many clients already'),
    );
    await expect(provider.pareamento(ctx)).rejects.toThrow(BadGatewayException);

    mockHttp.chamar.mockRejectedValueOnce(
      new EvolutionGoErroHttp(401, '{"error":"not authorized"}', 'not authorized'),
    );
    await expect(provider.pareamento(ctx)).rejects.toThrow('401');
  });

  it('iniciar recria instância se connect falhar com 401 (token órfão/zumbi)', async () => {
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: null,
      vendedorNome: null,
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'admin-key',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'empresa_emp1_empresa',
        id: 'uuid-antigo',
        token: 'token-antigo',
        webhookSegredo: null,
      },
    };

    // 1. /instance/all encontra a antiga
    mockHttp.chamar.mockResolvedValueOnce({
      data: [{ id: 'uuid-antigo', name: 'empresa_emp1_empresa', token: 'token-antigo' }],
    });
    // 2. aplicarConfiguracoes tenta PUT /instance/uuid-antigo/advanced-settings
    mockHttp.chamar.mockRejectedValueOnce(
      new BadGatewayException('A Evolution GO recusou a operação (401): not authorized'),
    );
    // 3. /instance/connect falha com 401
    mockHttp.chamar.mockRejectedValueOnce(
      new BadGatewayException('A Evolution GO recusou a operação (401): not authorized'),
    );
    // 4. /instance/delete/uuid-antigo é chamado
    mockHttp.chamar.mockResolvedValueOnce({ status: 'SUCCESS' });
    // 5. /instance/create é chamado
    mockHttp.chamar.mockResolvedValueOnce({
      data: { id: 'uuid-novo', token: 'token-novo' },
    });
    // 6. /instance/connect com a nova instância
    mockHttp.chamar.mockResolvedValue({});

    const novaInstancia = await provider.iniciar(ctx, { arquivarMensagens: false });
    expect(novaInstancia).toBeDefined();
    expect(novaInstancia?.id).toBe('uuid-novo');
    expect(novaInstancia?.token).toBe('token-novo');
  });
});


describe('EvolutionGoProvider — corrida do connect com o QR', () => {
  // O `/instance/qr` da 0.7.2 sobe um segundo cliente se o primeiro ainda não
  // foi registrado; os dois disputam o aparelho e o segundo derruba o
  // pareamento bom. O `iniciar` só devolve depois de o cliente aparecer.
  it('iniciar espera o gateway registrar o cliente antes de devolver', async () => {
    const chamadas: string[] = [];
    let consultasStatus = 0;
    const http = {
      chamar: jest.fn((_url: string, caminho: string) => {
        chamadas.push(caminho);
        if (caminho === '/instance/all') {
          return Promise.resolve({
            data: [{ id: 'uuid-1', name: 'inst', token: 'tok-1' }],
          });
        }
        if (caminho === '/instance/status') {
          consultasStatus += 1;
          return Promise.resolve({
            data: { Connected: consultasStatus >= 3, LoggedIn: false },
          });
        }
        return Promise.resolve({});
      }),
    };
    const provider = new EvolutionGoProvider(
      http as unknown as EvolutionGoClient,
    );
    const ctx = {
      empresaId: 'emp1',
      sessaoId: 'sess1',
      vendedorId: 'v1',
      vendedorNome: 'Ana',
      transporte: 'evolution_go' as const,
      config: {
        workerUrl: null,
        evolutionUrl: 'http://gateway:8080',
        evolutionApiKey: 'admin-key',
        historicoDias: 0,
        evolutionAlwaysOnline: false,
        evolutionIgnoreGroups: true,
        evolutionIgnoreStatus: true,
        evolutionReadMessages: false,
        evolutionRejectCall: false,
        evolutionMsgRejectCall: null,
        cloudApiPhoneNumberId: null,
        cloudApiBusinessAccountId: null,
        cloudApiAccessToken: null,
        cloudApiAppSecret: null,
      },
      instancia: {
        nome: 'inst',
        id: 'uuid-1',
        token: 'tok-1',
        webhookSegredo: null,
      },
    };

    await provider.iniciar(ctx, { arquivarMensagens: false });

    expect(consultasStatus).toBe(3);
    expect(chamadas.indexOf('/instance/status')).toBeGreaterThan(
      chamadas.indexOf('/instance/connect'),
    );
    expect(chamadas).not.toContain('/instance/qr');
  });
});

describe('EvolutionGoProvider — nome da instância', () => {
  const provider = new EvolutionGoProvider({} as never);
  const nome = (ctx: Record<string, unknown>): string =>
    (provider as any).nomeInstancia({
      sessaoId: '276fc417-de6a-4be7-b541-8b0000000000',
      instancia: { nome: null },
      ...ctx,
    });

  it('empresa, código e primeiro nome do vendedor, mesmo em CAIXA ALTA', () => {
    expect(
      nome({
        empresaNome: 'RCG Distribuidora',
        vendedorCodigo: '000123',
        vendedorNome: 'MÁRCIO DA SILVA',
      }),
    ).toBe('rcg-distribuidora-000123-marcio-276fc417');
  });

  it('omite o código ausente e usa institucional sem vendedor', () => {
    expect(
      nome({ empresaNome: 'RCG', vendedorCodigo: null, vendedorNome: 'Ana' }),
    ).toBe('rcg-ana-276fc417');
    expect(nome({ empresaNome: 'RCG', vendedorNome: null })).toBe(
      'rcg-institucional-276fc417',
    );
  });

  it('nome já gravado não é recalculado', () => {
    expect(
      nome({ instancia: { nome: 'rcg-vendedor-antigo' }, vendedorNome: 'Ana' }),
    ).toBe('rcg-vendedor-antigo');
  });
});

describe('EvolutionGoProvider — id da mensagem enviada', () => {
  const provider = new EvolutionGoProvider({} as never);
  const extrair = (resposta: unknown): string =>
    (provider as any).externoId(resposta);

  it('lê o formato da 0.7.2 (data.Info.ID)', () => {
    expect(
      extrair({
        message: 'success',
        data: { Info: { ID: '3EB0ABC123', Chat: '5511@s.whatsapp.net' } },
      }),
    ).toBe('3EB0ABC123');
  });

  it('sem id, recusa em vez de inventar', () => {
    expect(() => extrair({ message: 'success', data: {} })).toThrow(
      BadGatewayException,
    );
  });
});

describe('EvolutionGoProvider — envio de mídia (contrato da 0.7.2)', () => {
  const ctx = {
    empresaId: 'emp1',
    sessaoId: 'sess1',
    config: { evolutionUrl: 'http://gateway:8080' },
    instancia: { token: 'token-da-instancia' },
  } as never;

  const enviar = async (arquivo: Record<string, unknown>) => {
    const mockHttp = {
      chamar: jest
        .fn()
        .mockResolvedValue({ data: { Info: { ID: '3EB0MIDIA' } } }),
    };
    const provider = new EvolutionGoProvider(
      mockHttp as unknown as EvolutionGoClient,
    );
    const resultado = await provider.enviarArquivo(ctx, {
      jid: '5511999998888@s.whatsapp.net',
      arquivo: {
        nome: 'arquivo',
        mime: 'application/octet-stream',
        conteudoBase64: Buffer.from('bytes').toString('base64'),
        ...arquivo,
      } as never,
    });
    const [, caminho, opcoes] = mockHttp.chamar.mock.calls[0];
    return { resultado, caminho, corpo: opcoes.corpo as FormData, opcoes };
  };

  it('manda os bytes por multipart, nunca como data: URI', async () => {
    const { caminho, corpo, resultado } = await enviar({
      tipo: 'documento',
      nome: 'proposta.pdf',
      mime: 'application/pdf',
    });
    expect(caminho).toBe('/send/media');
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('type')).toBe('document');
    expect(corpo.get('number')).toBe('5511999998888');
    expect(corpo.get('url')).toBeNull();
    expect(corpo.get('file')).toBeInstanceOf(Blob);
    expect(resultado.externoId).toBe('3EB0MIDIA');
  });

  it('áudio gravado sai como "audio" — a 0.7.2 recusa "ptt"', async () => {
    const { corpo } = await enviar({
      tipo: 'audio',
      mime: 'audio/webm',
      ptt: true,
    });
    expect(corpo.get('type')).toBe('audio');
  });

  it('legenda vazia não é enviada', async () => {
    const { corpo } = await enviar({ tipo: 'imagem', legenda: '' });
    expect(corpo.get('caption')).toBeNull();
  });
});
