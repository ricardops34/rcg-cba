import { WhatsappEvolutionController } from './whatsapp-evolution.controller';

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
