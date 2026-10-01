import { BadGatewayException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { ParametrosService } from '../parametros/parametros.service';
import { NotasSaidaService } from '../notas-saida/notas-saida.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { EmailConfigService } from '../email/email-config.service';
import { EMAIL_MODELOS_PADRAO } from '@plataforma/contracts';
import {
  DocumentosEmailService,
  extrairEmails,
} from './documentos-email.service';

// docs/planos/2026-10-01-envio-email-documentos-cobranca.md
describe('DocumentosEmailService', () => {
  const empresaId = 'empresa-1';
  const user = { id: 'usuario-1' } as never;

  function montar(
    opcoes: { emailCliente?: string | null; smtp?: boolean } = {},
  ) {
    const tx = {
      cliente: {
        findFirst: jest.fn().mockResolvedValue({
          razaoSocial: 'MERCADO DO JOAO',
          email:
            opcoes.emailCliente === undefined
              ? 'financeiro@joao.com.br; compras@joao.com.br'
              : opcoes.emailCliente,
          vendedorId: 'vendedor-1',
        }),
      },
      notaSaida: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'nota-1', numero: '000116067' }]),
      },
      atividade: { create: jest.fn() },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
      empresa: {
        findFirst: jest.fn().mockResolvedValue({
          nomeFantasia: 'RCG DISTRIBUIDORA',
          razaoSocial: 'REPRESENTACOES CAMPO GRANDE LTDA',
          cnpj: '03715067000109',
          alias: 'rcg',
        }),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({
          nome: 'Operador',
          email: 'operador@rcg.com.br',
        }),
      },
    };
    const mail = {
      configurado: jest.fn().mockReturnValue(opcoes.smtp ?? true),
      send: jest.fn().mockResolvedValue(true),
    };
    const parametros = { obterTexto: jest.fn().mockResolvedValue(null) };
    const notas = {
      gerarDanfe: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('%PDF'),
        nomeArquivo: 'danfe-116067.pdf',
        numero: '116067',
        chave: '50260600000000000191550010001160671000116060',
        cancelada: false,
        clienteId: 'cliente-1',
        vendedorId: 'vendedor-1',
      }),
      obterXml: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('<xml/>'),
        nomeArquivo: 'nfe-116067.xml',
      }),
    };
    const boleto = {
      conteudo: Buffer.from('%PDF'),
      nomeArquivo: 'boleto-116067A.pdf',
      numero: '116067',
      numeroDocumento: '116067/A',
      clienteId: 'cliente-1',
      vendedorId: 'vendedor-1',
      vencimento: new Date('2026-07-28T00:00:00Z'),
      valor: 1300,
      linhaDigitavelFormatada:
        '23790.00000 00000.000000 00000.000000 1 00000000130000',
      encargos: { diasAtraso: 3, atualizadoAte: new Date() },
    };
    const titulos = {
      gerarBoleto: jest.fn().mockResolvedValue(boleto),
      descreverBoleto: jest.fn().mockReturnValue('atualizado'),
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            id: 't1',
            numero: '116067',
            parcela: 'A',
            prefixo: 'IMP',
            vencimento: '2026-07-28',
            saldo: 1000,
            temBoleto: true,
          },
          {
            id: 't2',
            numero: '116067',
            parcela: 'B',
            prefixo: 'IMP',
            vencimento: '2026-08-28',
            saldo: 500,
            temBoleto: false,
          },
        ],
      }),
    };
    const emailConfig = {
      exigir: jest.fn().mockResolvedValue(undefined),
      obterModelos: jest.fn().mockResolvedValue(EMAIL_MODELOS_PADRAO),
    };
    const service = new DocumentosEmailService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      parametros as unknown as ParametrosService,
      notas as unknown as NotasSaidaService,
      titulos as unknown as TitulosReceberService,
      emailConfig as unknown as EmailConfigService,
    );
    return { service, mail, tx, titulos, notas, emailConfig };
  }

  it('DANFE e XML vão para os e-mails do cadastro do cliente, e o envio entra no histórico', async () => {
    const { service, mail, tx } = montar();
    const r = await service.enviarNota(empresaId, user, 'nota-1', {
      incluirXml: true,
    });

    expect(r.enviadoPara).toEqual([
      'financeiro@joao.com.br',
      'compras@joao.com.br',
    ]);
    const [para, assunto, html, , anexos] = mail.send.mock.calls[0];
    expect(para).toEqual(['financeiro@joao.com.br', 'compras@joao.com.br']);
    expect(assunto).toBe('NF 116067 — RCG DISTRIBUIDORA');
    expect(html).toContain('REPRESENTACOES CAMPO GRANDE LTDA');
    expect(anexos.map((a: { nome: string }) => a.nome)).toEqual([
      'danfe-116067.pdf',
      'nfe-116067.xml',
    ]);
    expect(tx.atividade.create.mock.calls[0][0].data).toMatchObject({
      clienteId: 'cliente-1',
      tipo: 'email',
      titulo: 'DANFE enviado por e-mail — NF 116067',
      createdBy: 'usuario-1',
    });
  });

  it('funcionalidade desligada em Administração > E-mail: nada é gerado nem enviado', async () => {
    const { service, mail, notas, emailConfig } = montar();
    emailConfig.exigir.mockRejectedValueOnce(
      new ConflictException('E-mail de DANFE e XML desabilitado.'),
    );
    await expect(
      service.enviarNota(empresaId, user, 'nota-1', { incluirXml: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(emailConfig.exigir).toHaveBeenCalledWith(empresaId, 'documentos');
    expect(notas.gerarDanfe).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('cliente sem e-mail no cadastro: 409, e nada é enviado', async () => {
    const { service, mail } = montar({ emailCliente: null });
    await expect(
      service.enviarNota(empresaId, user, 'nota-1', { incluirXml: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sem SMTP configurado: 409 apontando os parâmetros', async () => {
    const { service, mail } = montar({ smtp: false });
    await expect(
      service.enviarBoleto(empresaId, user, 't1', { atualizado: true }),
    ).rejects.toThrow(/Administração > Parâmetros/);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('servidor recusou: 502 com o motivo, e não grava histórico de um envio que não saiu', async () => {
    const { service, mail, tx } = montar();
    mail.send.mockRejectedValueOnce(new Error('535 Authentication failed'));
    await expect(
      service.enviarBoleto(empresaId, user, 't1', { atualizado: true }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(tx.atividade.create).not.toHaveBeenCalled();
  });

  it('cobrança: tabela dos vencidos, boleto de quem tem e DANFE da nota de mesmo número', async () => {
    const { service, mail, tx, titulos, notas } = montar();
    const r = await service.enviarCobranca(empresaId, user, 'cliente-1');

    expect(titulos.findAll.mock.calls[0][2]).toMatchObject({
      status: 'vencido',
      clienteId: 'cliente-1',
    });
    // t2 não tem 2ª via: vai na tabela, sem boleto, e o motivo volta em avisos.
    expect(titulos.gerarBoleto).toHaveBeenCalledTimes(1);
    expect(notas.gerarDanfe).toHaveBeenCalledTimes(1);
    expect(r.anexos).toEqual(['boleto-116067A.pdf', 'danfe-116067.pdf']);
    expect(r.avisos).toEqual(['Título 116067/B: sem 2ª via de boleto']);

    const [, assunto, html] = mail.send.mock.calls[0];
    expect(assunto).toBe('Títulos em atraso — RCG DISTRIBUIDORA');
    expect(html).toContain('116067/A');
    expect(html).toContain('Fale conosco');
    expect(tx.atividade.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'email',
      titulo: 'Cobrança de títulos vencidos enviada por e-mail',
      vendedorId: 'vendedor-1',
    });
  });

  it('cliente sem título vencido: 409', async () => {
    const { service, titulos } = montar();
    titulos.findAll.mockResolvedValueOnce({ data: [] });
    await expect(
      service.enviarCobranca(empresaId, user, 'cliente-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('extrairEmails', () => {
  it('aceita vários separados por ; , ou espaço, e descarta o que não é e-mail', () => {
    expect(
      extrairEmails(' A@x.com.br; b@y.com , lixo  c@z.com a@x.com.br'),
    ).toEqual(['a@x.com.br', 'b@y.com', 'c@z.com']);
    expect(extrairEmails(null)).toEqual([]);
  });
});
