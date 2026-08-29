import { EvolutionGoProvider } from './evolution-go.provider';

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
