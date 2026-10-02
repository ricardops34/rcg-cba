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
