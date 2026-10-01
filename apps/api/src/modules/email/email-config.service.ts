import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type {
  EmailConfiguracao,
  EmailConfiguracaoUpdate,
  EmailDisponibilidade,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import {
  buscarEmpresaDoEmail,
  layoutEmail,
} from '../../common/mail/email-layout';
import { escapeHtml } from '../../common/html/escape-html';
import { ParametrosService } from '../parametros/parametros.service';

/**
 * Parâmetros do e-mail, editados juntos pela tela Administração > E-mail —
 * mesmo desenho do SMS, sem tabela própria (decisão do usuário, 01/10/2026).
 * Tipo e descrição servem para criar o parâmetro se a empresa não o tiver.
 *
 * `EMAIL_ATIVO` nasce **ligado**, ao contrário do SMS: o e-mail de senha já
 * estava em uso quando a chave chegou, e desligá-lo no deploy cortaria o envio.
 */
export const EMAIL_PARAMETROS = {
  ativo: {
    parametro: 'EMAIL_ATIVO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Habilita o envio de e-mail nesta empresa',
  },
  host: {
    parametro: 'SMTP_HOST',
    tipo: 'texto',
    tamanho: 120,
    padrao: null,
    descricao: 'Servidor de e-mail; vazio usa a configuração do servidor',
  },
  porta: {
    parametro: 'SMTP_PORTA',
    tipo: 'numero',
    tamanho: 5,
    padrao: null,
    descricao: 'Porta do servidor de e-mail (ex.: 587)',
  },
  seguro: {
    parametro: 'SMTP_SEGURO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'false',
    descricao: 'Conexão SSL/TLS direta com o servidor de e-mail',
  },
  usuario: {
    parametro: 'SMTP_USUARIO',
    tipo: 'texto',
    tamanho: 120,
    padrao: null,
    descricao: 'Usuário de autenticação no servidor de e-mail',
  },
  senha: {
    parametro: 'SMTP_SENHA',
    tipo: 'senha',
    tamanho: 120,
    padrao: null,
    descricao: 'Senha de autenticação no servidor de e-mail',
  },
  remetente: {
    parametro: 'SMTP_REMETENTE',
    tipo: 'texto',
    tamanho: 150,
    padrao: null,
    descricao: 'Endereço exibido como remetente dos e-mails',
  },
  documentos: {
    parametro: 'EMAIL_DOCUMENTOS',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Permite enviar DANFE e XML por e-mail ao cliente',
  },
  boleto: {
    parametro: 'EMAIL_BOLETO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Permite enviar boleto por e-mail ao cliente',
  },
  cobranca: {
    parametro: 'EMAIL_COBRANCA',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Permite enviar cobrança de títulos vencidos por e-mail',
  },
  senhaProvisoria: {
    parametro: 'EMAIL_SENHA_PROVISORIA',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Envia a senha provisória do vendedor por e-mail',
  },
} as const;

type Definicao = (typeof EMAIL_PARAMETROS)[keyof typeof EMAIL_PARAMETROS];

/** Funcionalidade de e-mail que um envio usa. */
export type FuncionalidadeEmail = Exclude<
  keyof EmailDisponibilidade,
  'habilitado'
>;

const NOME_FUNCIONALIDADE: Record<FuncionalidadeEmail, string> = {
  documentos: 'DANFE e XML',
  boleto: 'boleto',
  cobranca: 'cobrança',
  senhaProvisoria: 'senha provisória',
};

@Injectable()
export class EmailConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly mail: MailService,
  ) {}

  private bool(empresaId: string, d: Definicao) {
    return this.parametros.obterBoolean(
      empresaId,
      d.parametro,
      d.padrao === 'true',
    );
  }

  async configuracao(empresaId: string): Promise<EmailConfiguracao> {
    const P = EMAIL_PARAMETROS;
    const texto = async (d: Definicao) =>
      (await this.parametros.obterTexto(empresaId, d.parametro))?.trim() ?? '';
    const host = await texto(P.host);
    const porta = await this.parametros.obterNumero(
      empresaId,
      P.porta.parametro,
      0,
    );
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    const smtpConfigurado = this.mail.configurado(smtp);
    const ativo = await this.bool(empresaId, P.ativo);
    return {
      ativo,
      host,
      porta: porta || null,
      seguro: await this.bool(empresaId, P.seguro),
      usuario: await texto(P.usuario),
      senhaPreenchida: !!(await texto(P.senha)),
      remetente: await texto(P.remetente),
      documentos: await this.bool(empresaId, P.documentos),
      boleto: await this.bool(empresaId, P.boleto),
      cobranca: await this.bool(empresaId, P.cobranca),
      senhaProvisoria: await this.bool(empresaId, P.senhaProvisoria),
      usaServidorDoAmbiente: !host && smtpConfigurado,
      smtpConfigurado,
      habilitado: ativo && smtpConfigurado,
    };
  }

  /** Cada botão de e-mail só aparece com o envio habilitado e o seu ligado. */
  async disponibilidade(empresaId: string): Promise<EmailDisponibilidade> {
    const c = await this.configuracao(empresaId);
    return {
      habilitado: c.habilitado,
      documentos: c.habilitado && c.documentos,
      boleto: c.habilitado && c.boleto,
      cobranca: c.habilitado && c.cobranca,
      senhaProvisoria: c.habilitado && c.senhaProvisoria,
    };
  }

  /** 409 quando o envio ou a funcionalidade está desligado. */
  async exigir(empresaId: string, funcionalidade: FuncionalidadeEmail) {
    const d = await this.disponibilidade(empresaId);
    if (!d.habilitado) {
      throw new ConflictException(
        'Envio de e-mail desabilitado ou sem servidor configurado. Configure em Administração > E-mail.',
      );
    }
    if (!d[funcionalidade]) {
      throw new ConflictException(
        `E-mail de ${NOME_FUNCIONALIDADE[funcionalidade]} desabilitado. Ligue em Administração > E-mail.`,
      );
    }
  }

  /** Grava a tela nos parâmetros. A senha só muda quando vem preenchida. */
  async salvar(
    empresaId: string,
    autor: string,
    dados: EmailConfiguracaoUpdate,
  ) {
    const P = EMAIL_PARAMETROS;
    const valores: Array<[Definicao, string | null]> = [
      [P.ativo, String(dados.ativo)],
      [P.host, dados.host || null],
      [P.porta, dados.porta ? String(dados.porta) : null],
      [P.seguro, String(dados.seguro)],
      [P.usuario, dados.usuario || null],
      [P.remetente, dados.remetente || null],
      [P.documentos, String(dados.documentos)],
      [P.boleto, String(dados.boleto)],
      [P.cobranca, String(dados.cobranca)],
      [P.senhaProvisoria, String(dados.senhaProvisoria)],
    ];
    if (dados.senha) valores.push([P.senha, dados.senha]);

    await this.prisma.withTenant(empresaId, async (tx) => {
      for (const [d, conteudo] of valores) {
        await tx.parametroEmpresa.upsert({
          where: { empresaId_parametro: { empresaId, parametro: d.parametro } },
          create: {
            empresaId,
            parametro: d.parametro,
            tipo: d.tipo,
            tamanho: d.tamanho,
            conteudo,
            descricao: d.descricao,
            createdBy: autor,
            updatedBy: autor,
          },
          update: { conteudo, ativo: true, deletedAt: null, updatedBy: autor },
        });
      }
    });
  }

  /**
   * Manda um e-mail de teste para o próprio usuário, com a configuração
   * gravada — mesmo com o envio desligado, para conferir antes de ligar. O
   * erro do servidor volta inteiro: é o que se precisa ler para corrigir.
   */
  async enviarTeste(empresaId: string, para: string) {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mail.configurado(smtp)) {
      throw new ConflictException(
        'Sem servidor de e-mail: preencha o servidor (SMTP_HOST) e salve antes de testar.',
      );
    }
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const html = layoutEmail(
      empresa,
      `<p>Este é um e-mail de teste da plataforma para <strong>${escapeHtml(
        empresa.nomeFantasia,
      )}</strong>.</p><p>Se você está lendo, o envio de e-mail está funcionando.</p>`,
    );
    try {
      await this.mail.send(
        para,
        `Teste de e-mail — ${empresa.nomeFantasia}`,
        html,
        smtp,
      );
    } catch (erro) {
      throw new BadGatewayException(
        `O servidor de e-mail recusou o envio: ${(erro as Error).message}`,
      );
    }
    return { enviadoPara: para };
  }
}
