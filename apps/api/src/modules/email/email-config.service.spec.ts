import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { ParametrosService } from '../parametros/parametros.service';
import { EmailConfigService } from './email-config.service';

// Mesmo desenho do SMS (decisão do usuário, 01/10/2026): EMAIL_ATIVO e uma
// chave por funcionalidade, nos parâmetros.
describe('EmailConfigService', () => {
  function montar(
    flags: Record<string, boolean>,
    textos: Record<string, string> = { SMTP_HOST: 'mail.rcgdist.com.br' },
    servidorDoAmbiente = false,
  ) {
    const parametros = {
      obterBoolean: jest.fn((_e: string, p: string, padrao: boolean) =>
        Promise.resolve(p in flags ? flags[p] : padrao),
      ),
      obterTexto: jest.fn((_e: string, p: string) =>
        Promise.resolve(textos[p] ?? null),
      ),
      obterNumero: jest.fn((_e: string, _p: string, padrao: number) =>
        Promise.resolve(padrao),
      ),
    };
    const mail = {
      configurado: jest.fn(
        (smtp: { host?: string } | null) => !!smtp?.host || servidorDoAmbiente,
      ),
    };
    return new EmailConfigService(
      {} as PrismaService,
      parametros as unknown as ParametrosService,
      mail as unknown as MailService,
    );
  }

  it('EMAIL_ATIVO nasce ligado: com servidor, tudo disponível', async () => {
    expect(await montar({}).disponibilidade('e')).toEqual({
      habilitado: true,
      documentos: true,
      boleto: true,
      cobranca: true,
      senhaProvisoria: true,
    });
  });

  it('desligado, nenhum botão de e-mail aparece', async () => {
    const d = await montar({ EMAIL_ATIVO: false }).disponibilidade('e');
    expect(d).toEqual({
      habilitado: false,
      documentos: false,
      boleto: false,
      cobranca: false,
      senhaProvisoria: false,
    });
  });

  it('sem servidor (nem da empresa nem do ambiente), não habilita', async () => {
    expect((await montar({}, {}).disponibilidade('e')).habilitado).toBe(false);
  });

  it('servidor do ambiente vale quando a empresa não tem SMTP_HOST', async () => {
    const c = await montar({}, {}, true).configuracao('e');
    expect(c).toMatchObject({ habilitado: true, usaServidorDoAmbiente: true });
  });

  it('exigir: funcionalidade desligada é 409 com o nome dela', async () => {
    const service = montar({ EMAIL_COBRANCA: false });
    await expect(service.exigir('e', 'cobranca')).rejects.toThrow(
      /E-mail de cobrança desabilitado/,
    );
    await expect(service.exigir('e', 'boleto')).resolves.toBeUndefined();
  });

  it('a senha do SMTP não volta, só se está preenchida', async () => {
    const c = await montar(
      {},
      { SMTP_HOST: 'h', SMTP_SENHA: 'segredo' },
    ).configuracao('e');
    expect(c).not.toHaveProperty('senha');
    expect(c.senhaPreenchida).toBe(true);
    expect(ConflictException).toBeDefined();
  });
});
