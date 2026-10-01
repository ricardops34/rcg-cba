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

  describe('Modelos de E-mail', () => {
    it('obterModelos retorna padrões do sistema quando nenhum parâmetro customizado existir', async () => {
      const service = montar({});
      const modelos = await service.obterModelos('empresa-1');
      expect(modelos.cobrancaAssunto).toContain('Títulos em atraso');
      expect(modelos.notaAssunto).toContain('NF {{nota.numero}}');
      expect(modelos.boletoAssunto).toContain('Boleto do título');
      expect(modelos.replyToUsuario).toBe(true);
      expect(modelos.incluirAssinaturaUsuario).toBe(true);
      expect(modelos.corCabecalho).toBeNull();
    });

    it('obterModelos mescla parâmetros customizados da empresa', async () => {
      const service = montar(
        { EMAIL_REPLY_TO_USUARIO: false },
        {
          EMAIL_MODELO_NOTA_ASSUNTO: 'Sua Nota Chegou!',
          EMAIL_COR_CABECALHO: '#1e3a8a',
        },
      );
      const modelos = await service.obterModelos('empresa-1');
      expect(modelos.notaAssunto).toBe('Sua Nota Chegou!');
      expect(modelos.corCabecalho).toBe('#1e3a8a');
      expect(modelos.replyToUsuario).toBe(false);
      // Mantém o padrão para o que não foi customizado
      expect(modelos.boletoAssunto).toContain('Boleto do título');
    });

    it('salvarModelos grava parâmetros via withTenant e upsert', async () => {
      const upsertMock = jest.fn().mockResolvedValue({});
      const prismaMock = {
        withTenant: jest.fn(async (_empresaId: string, callback: (tx: any) => Promise<any>) => {
          return callback({ parametroEmpresa: { upsert: upsertMock } });
        }),
      };
      const parametros = {
        obterBoolean: jest.fn().mockResolvedValue(true),
        obterTexto: jest.fn().mockResolvedValue('Novo Assunto'),
      };
      const service = new EmailConfigService(
        prismaMock as unknown as PrismaService,
        parametros as unknown as ParametrosService,
        {} as MailService,
      );

      await service.salvarModelos('empresa-1', 'usuario-admin', {
        notaAssunto: 'Novo Assunto',
        corCabecalho: '#123456',
      });

      expect(prismaMock.withTenant).toHaveBeenCalledWith('empresa-1', expect.any(Function));
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            empresaId_parametro: {
              empresaId: 'empresa-1',
              parametro: 'EMAIL_MODELO_NOTA_ASSUNTO',
            },
          },
          update: expect.objectContaining({ conteudo: 'Novo Assunto' }),
        }),
      );
    });

    it('restaurarModelos remove parâmetros customizados do tenant', async () => {
      const deleteManyMock = jest.fn().mockResolvedValue({ count: 1 });
      const prismaMock = {
        withTenant: jest.fn(async (_empresaId: string, callback: (tx: any) => Promise<any>) => {
          return callback({ parametroEmpresa: { deleteMany: deleteManyMock } });
        }),
      };
      const parametros = {
        obterBoolean: jest.fn().mockResolvedValue(true),
        obterTexto: jest.fn().mockResolvedValue(null),
      };
      const service = new EmailConfigService(
        prismaMock as unknown as PrismaService,
        parametros as unknown as ParametrosService,
        {} as MailService,
      );

      await service.restaurarModelos('empresa-1', 'usuario-admin', 'nota');

      expect(prismaMock.withTenant).toHaveBeenCalledWith('empresa-1', expect.any(Function));
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { empresaId: 'empresa-1', parametro: 'EMAIL_MODELO_NOTA_ASSUNTO' },
      });
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { empresaId: 'empresa-1', parametro: 'EMAIL_MODELO_NOTA_TEXTO' },
      });
    });
  });
});
