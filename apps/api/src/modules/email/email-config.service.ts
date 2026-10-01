import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  EMAIL_MODELOS_PADRAO,
  type EmailConfiguracao,
  type EmailConfiguracaoUpdate,
  type EmailDisponibilidade,
  type EmailModelosConfiguracao,
  type EmailModelosUpdate,
  type EmailModeloTesteInput,
  type EmailTesteResultado,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService, type AnexoEmail } from '../../common/mail/mail.service';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import {
  buscarEmpresaDoEmail,
  carregarLogoEmail,
  layoutEmail,
} from '../../common/mail/email-layout';
import { escapeHtml } from '../../common/html/escape-html';
import {
  substituirTags,
  formatarTextoHtml,
} from '../../common/mail/substituir-tags';
import { ParametrosService } from '../parametros/parametros.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Parâmetros do e-mail, editados juntos pela tela Administração > E-mail —
 * mesmo desenho do SMS, sem tabela própria (decisão do usuário, 01/10/2026).
 * Tipo e descrição servem para criar o parâmetro se a empresa não o tiver.
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

export const EMAIL_MODELOS_PARAMETROS = {
  cobrancaAssunto: {
    parametro: 'EMAIL_MODELO_COBRANCA_ASSUNTO',
    tipo: 'texto',
    tamanho: 200,
    padrao: null,
    descricao: 'Modelo de assunto do e-mail de cobrança',
  },
  cobrancaTexto: {
    parametro: 'EMAIL_MODELO_COBRANCA_TEXTO',
    tipo: 'texto',
    tamanho: 2000,
    padrao: null,
    descricao: 'Modelo de texto de abertura do e-mail de cobrança',
  },
  notaAssunto: {
    parametro: 'EMAIL_MODELO_NOTA_ASSUNTO',
    tipo: 'texto',
    tamanho: 200,
    padrao: null,
    descricao: 'Modelo de assunto do e-mail de nota fiscal (DANFE/XML)',
  },
  notaTexto: {
    parametro: 'EMAIL_MODELO_NOTA_TEXTO',
    tipo: 'texto',
    tamanho: 2000,
    padrao: null,
    descricao: 'Modelo de texto de abertura do e-mail de nota fiscal',
  },
  boletoAssunto: {
    parametro: 'EMAIL_MODELO_BOLETO_ASSUNTO',
    tipo: 'texto',
    tamanho: 200,
    padrao: null,
    descricao: 'Modelo de assunto do e-mail de boleto',
  },
  boletoTexto: {
    parametro: 'EMAIL_MODELO_BOLETO_TEXTO',
    tipo: 'texto',
    tamanho: 2000,
    padrao: null,
    descricao: 'Modelo de texto de abertura do e-mail de boleto',
  },
  corCabecalho: {
    parametro: 'EMAIL_COR_CABECALHO',
    tipo: 'texto',
    tamanho: 10,
    padrao: null,
    descricao: 'Cor hexadecimal da faixa de topo do e-mail (#rrggbb)',
  },
  replyToUsuario: {
    parametro: 'EMAIL_REPLY_TO_USUARIO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Direciona respostas de e-mail para o colaborador remetente',
  },
  incluirAssinaturaUsuario: {
    parametro: 'EMAIL_ASSINATURA_USUARIO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Inclui card de assinatura do colaborador remetente no rodapé',
  },
  incluirTelefoneUsuario: {
    parametro: 'EMAIL_ASSINATURA_TELEFONE',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Exibe WhatsApp/telefone do colaborador na assinatura do e-mail',
  },
  incluirEmailUsuario: {
    parametro: 'EMAIL_ASSINATURA_EMAIL',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao: 'Exibe e-mail do colaborador na assinatura do e-mail',
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

  // -------------------------------------------------------------------------
  // Modelos e Identidade Visual
  // -------------------------------------------------------------------------

  /** Lê os modelos configurados na empresa, usando o padrão do sistema se não houver. */
  async obterModelos(empresaId: string): Promise<EmailModelosConfiguracao> {
    const MP = EMAIL_MODELOS_PARAMETROS;
    const txt = async (p: string, padrao: string) => {
      const v = (await this.parametros.obterTexto(empresaId, p))?.trim();
      return v || padrao;
    };

    const corCabecalho =
      (
        await this.parametros.obterTexto(empresaId, MP.corCabecalho.parametro)
      )?.trim() || null;

    const replyToUsuario = await this.parametros.obterBoolean(
      empresaId,
      MP.replyToUsuario.parametro,
      true,
    );

    const incluirAssinaturaUsuario = await this.parametros.obterBoolean(
      empresaId,
      MP.incluirAssinaturaUsuario.parametro,
      true,
    );

    const incluirTelefoneUsuario = await this.parametros.obterBoolean(
      empresaId,
      MP.incluirTelefoneUsuario.parametro,
      true,
    );

    const incluirEmailUsuario = await this.parametros.obterBoolean(
      empresaId,
      MP.incluirEmailUsuario.parametro,
      true,
    );

    return {
      cobrancaAssunto: await txt(
        MP.cobrancaAssunto.parametro,
        EMAIL_MODELOS_PADRAO.cobrancaAssunto,
      ),
      cobrancaTexto: await txt(
        MP.cobrancaTexto.parametro,
        EMAIL_MODELOS_PADRAO.cobrancaTexto,
      ),
      notaAssunto: await txt(
        MP.notaAssunto.parametro,
        EMAIL_MODELOS_PADRAO.notaAssunto,
      ),
      notaTexto: await txt(
        MP.notaTexto.parametro,
        EMAIL_MODELOS_PADRAO.notaTexto,
      ),
      boletoAssunto: await txt(
        MP.boletoAssunto.parametro,
        EMAIL_MODELOS_PADRAO.boletoAssunto,
      ),
      boletoTexto: await txt(
        MP.boletoTexto.parametro,
        EMAIL_MODELOS_PADRAO.boletoTexto,
      ),
      corCabecalho,
      replyToUsuario,
      incluirAssinaturaUsuario,
      incluirTelefoneUsuario,
      incluirEmailUsuario,
    };
  }

  /** Grava os modelos personalizados da empresa. */
  async salvarModelos(
    empresaId: string,
    autor: string,
    dados: EmailModelosUpdate,
  ): Promise<EmailModelosConfiguracao> {
    const MP = EMAIL_MODELOS_PARAMETROS;
    const pares: Array<[string, string | null]> = [];

    if (dados.cobrancaAssunto !== undefined)
      pares.push([MP.cobrancaAssunto.parametro, dados.cobrancaAssunto || null]);
    if (dados.cobrancaTexto !== undefined)
      pares.push([MP.cobrancaTexto.parametro, dados.cobrancaTexto || null]);

    if (dados.notaAssunto !== undefined)
      pares.push([MP.notaAssunto.parametro, dados.notaAssunto || null]);
    if (dados.notaTexto !== undefined)
      pares.push([MP.notaTexto.parametro, dados.notaTexto || null]);

    if (dados.boletoAssunto !== undefined)
      pares.push([MP.boletoAssunto.parametro, dados.boletoAssunto || null]);
    if (dados.boletoTexto !== undefined)
      pares.push([MP.boletoTexto.parametro, dados.boletoTexto || null]);

    if (dados.corCabecalho !== undefined)
      pares.push([MP.corCabecalho.parametro, dados.corCabecalho || null]);

    if (dados.replyToUsuario !== undefined)
      pares.push([MP.replyToUsuario.parametro, String(dados.replyToUsuario)]);

    if (dados.incluirAssinaturaUsuario !== undefined)
      pares.push([
        MP.incluirAssinaturaUsuario.parametro,
        String(dados.incluirAssinaturaUsuario),
      ]);

    if (dados.incluirTelefoneUsuario !== undefined)
      pares.push([
        MP.incluirTelefoneUsuario.parametro,
        String(dados.incluirTelefoneUsuario),
      ]);

    if (dados.incluirEmailUsuario !== undefined)
      pares.push([
        MP.incluirEmailUsuario.parametro,
        String(dados.incluirEmailUsuario),
      ]);

    await this.prisma.withTenant(empresaId, async (tx) => {
      for (const [parametro, conteudo] of pares) {
        await tx.parametroEmpresa.upsert({
          where: { empresaId_parametro: { empresaId, parametro } },
          create: {
            empresaId,
            parametro,
            tipo: parametro.includes('REPLY') || parametro.includes('ASSINATURA')
              ? 'booleano'
              : 'texto',
            tamanho: 2000,
            conteudo,
            createdBy: autor,
            updatedBy: autor,
          },
          update: { conteudo, ativo: true, deletedAt: null, updatedBy: autor },
        });
      }
    });

    return this.obterModelos(empresaId);
  }

  /** Restaura os modelos para o padrão do sistema (limpa as customizações da empresa). */
  async restaurarModelos(
    empresaId: string,
    autor: string,
    tipo: 'todos' | 'cobranca' | 'nota' | 'boleto' = 'todos',
  ): Promise<EmailModelosConfiguracao> {
    const MP = EMAIL_MODELOS_PARAMETROS;
    const aRemover: string[] = [];

    if (tipo === 'todos' || tipo === 'cobranca') {
      aRemover.push(MP.cobrancaAssunto.parametro, MP.cobrancaTexto.parametro);
    }
    if (tipo === 'todos' || tipo === 'nota') {
      aRemover.push(MP.notaAssunto.parametro, MP.notaTexto.parametro);
    }
    if (tipo === 'todos' || tipo === 'boleto') {
      aRemover.push(MP.boletoAssunto.parametro, MP.boletoTexto.parametro);
    }

    await this.prisma.withTenant(empresaId, async (tx) => {
      for (const parametro of aRemover) {
        await tx.parametroEmpresa.deleteMany({
          where: { empresaId, parametro },
        });
      }
    });

    return this.obterModelos(empresaId);
  }

  /** Envia um e-mail com o modelo renderizado e dados de demonstração. */
  async enviarTesteModelo(
    empresaId: string,
    user: AuthenticatedUser,
    input: EmailModeloTesteInput,
  ): Promise<EmailTesteResultado> {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mail.configurado(smtp)) {
      throw new ConflictException(
        'Sem servidor de e-mail: preencha o servidor (SMTP_HOST) e salve antes de testar.',
      );
    }

    const destino = input.destinatario?.trim() || user.email;
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const modelos = await this.obterModelos(empresaId);

    // Carrega logo inline se existir
    const logoInline = await carregarLogoEmail(empresa.logoUrl);
    const anexos: AnexoEmail[] = [];
    if (logoInline) {
      anexos.push({
        nome: logoInline.nome,
        conteudo: logoInline.conteudo,
        mime: logoInline.mime,
        cid: logoInline.cid,
      });
    }

    const remetente = modelos.incluirAssinaturaUsuario
      ? {
          nome: user.nome,
          cargo: user.isAdmin ? 'Administração' : 'Departamento Comercial',
          email: modelos.incluirEmailUsuario ? user.email : null,
          telefone: modelos.incluirTelefoneUsuario ? '(67) 3382-7328' : null,
        }
      : null;

    const contextoDemonstracao = {
      cliente: {
        nome: 'CLIENTE DEMONSTRAÇÃO LTDA',
        razaoSocial: 'CLIENTE DEMONSTRAÇÃO LTDA',
        cnpj: '12.345.678/0001-90',
      },
      empresa: {
        nomeFantasia: empresa.nomeFantasia,
        razaoSocial: empresa.razaoSocial,
        telefone: empresa.telefone || '(67) 3382-7328',
        email: empresa.email || 'contato@empresa.com.br',
      },
      colaborador: {
        nome: user.nome,
        cargo: user.isAdmin ? 'Administração' : 'Departamento Comercial',
        email: user.email,
        telefone: '(67) 3382-7328',
      },
      nota: {
        numero: '117179',
        serie: '1',
        chave: '5026 0903 7150 6700 0109 5500 1000 1171 7917 6411 5312',
        emissao: '01/10/2026',
      },
      boleto: {
        numero: '000117179',
        vencimento: '15/10/2026',
        valor: 'R$ 450,00',
        linhaDigitavel: '00190.00009 01171.790004 00000.000171 1 98760000045000',
      },
      cobranca: {
        quantidade: 2,
        total: 'R$ 694,70',
      },
    };

    let assuntoCru = '';
    let textoCru = '';
    let corpoDemonstracao = '';
    let badgeTitulo = '';

    if (input.tipo === 'cobranca') {
      badgeTitulo = 'Cobrança Comercial';
      assuntoCru = modelos.cobrancaAssunto;
      textoCru = modelos.cobrancaTexto;
      corpoDemonstracao = `
        <p>Prezado(a) <strong>${escapeHtml(contextoDemonstracao.cliente.razaoSocial)}</strong>,</p>
        <p>${formatarTextoHtml(substituirTags(textoCru, contextoDemonstracao))}</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;border:1px solid #e2e8f0;border-radius:6px">
          <thead><tr style="background:#f1f5f9;color:#475569">
            <th style="padding:8px 12px;text-align:left">Título</th>
            <th style="padding:8px 12px;text-align:left">Vencimento</th>
            <th style="padding:8px 12px;text-align:right">Saldo</th>
            <th style="padding:8px 12px;text-align:left">Boleto</th>
          </tr></thead>
          <tbody>
            <tr style="border-top:1px solid #e2e8f0"><td style="padding:8px 12px;font-weight:bold">000114826</td><td style="padding:8px 12px">02/06/2026</td><td style="padding:8px 12px;text-align:right;color:#b91c1c;font-weight:bold">R$ 143,00</td><td style="padding:8px 12px;color:#16a34a">Em anexo</td></tr>
            <tr style="border-top:1px solid #e2e8f0"><td style="padding:8px 12px;font-weight:bold">000117179</td><td style="padding:8px 12px">14/09/2026</td><td style="padding:8px 12px;text-align:right;color:#b91c1c;font-weight:bold">R$ 551,70</td><td style="padding:8px 12px;color:#16a34a">Em anexo</td></tr>
          </tbody>
          <tfoot><tr style="background:#f8fafc;border-top:2px solid #cbd5e1;font-weight:bold">
            <td colspan="2" style="padding:8px 12px;text-align:right">Total em Aberto:</td>
            <td style="padding:8px 12px;text-align:right;color:#0f172a">R$ 694,70</td>
            <td></td>
          </tr></tfoot>
        </table>
        <p style="font-size:12px;color:#64748b;font-style:italic">* Os boletos em anexo estão com os valores atualizados até hoje. Seguem também os DANFEs fiscais de origem.</p>`;
    } else if (input.tipo === 'nota') {
      badgeTitulo = 'Documento Fiscal';
      assuntoCru = modelos.notaAssunto;
      textoCru = modelos.notaTexto;
      corpoDemonstracao = `
        <p>Prezado(a) <strong>${escapeHtml(contextoDemonstracao.cliente.razaoSocial)}</strong>,</p>
        <p>${formatarTextoHtml(substituirTags(textoCru, contextoDemonstracao))}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:16px 0">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:bold">Dados do Documento</div>
          <div style="font-size:15px;font-weight:bold;color:#0f172a;margin-top:4px">Nota Fiscal Eletrônica nº 117179 — Série 1</div>
          <div style="font-size:12px;color:#475569;margin-top:6px">Chave de Acesso: <span style="font-family:monospace;color:#1e40af">5026 0903 7150 6700 0109 5500 1000 1171 7917 6411 5312</span></div>
        </div>
        <p style="font-size:12px;color:#64748b">Anexos: <code>danfe-117179.pdf</code> e <code>nfe-117179.xml</code>.</p>`;
    } else {
      badgeTitulo = 'Cobrança Bancária';
      assuntoCru = modelos.boletoAssunto;
      textoCru = modelos.boletoTexto;
      corpoDemonstracao = `
        <p>Prezado(a) <strong>${escapeHtml(contextoDemonstracao.cliente.razaoSocial)}</strong>,</p>
        <p>${formatarTextoHtml(substituirTags(textoCru, contextoDemonstracao))}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:16px 0">
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <tr><td style="padding:4px 0;color:#64748b">Título:</td><td style="padding:4px 0;font-weight:bold">000117179</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Vencimento:</td><td style="padding:4px 0;font-weight:bold">15/10/2026</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Valor:</td><td style="padding:4px 0;font-weight:bold;color:#1e40af">R$ 450,00</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Linha digitável:</td><td style="padding:4px 0;font-family:monospace;font-size:11px">00190.00009 01171.790004 00000.000171 1 98760000045000</td></tr>
          </table>
        </div>
        <p style="font-size:12px;color:#64748b">O boleto para pagamento segue anexado em formato PDF.</p>`;
    }

    const assunto = substituirTags(assuntoCru, contextoDemonstracao);
    const html = layoutEmail(empresa, corpoDemonstracao, {
      remetente,
      corCabecalho: modelos.corCabecalho,
      badgeTitulo,
      temLogo: Boolean(logoInline),
    });

    try {
      await this.mail.send(
        destino,
        `[TESTE] ${assunto}`,
        html,
        smtp,
        anexos,
        modelos.replyToUsuario ? user.email : undefined,
      );
    } catch (erro) {
      throw new BadGatewayException(
        `O servidor de e-mail recusou o envio: ${(erro as Error).message}`,
      );
    }

    return { enviadoPara: destino };
  }

  /**
   * Manda um e-mail de teste para o próprio usuário, com a configuração
   * gravada — mesmo com o envio desligado, para conferir antes de ligar.
   */
  async enviarTeste(empresaId: string, para: string) {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mail.configurado(smtp)) {
      throw new ConflictException(
        'Sem servidor de e-mail: preencha o servidor (SMTP_HOST) e salve antes de testar.',
      );
    }
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const logoInline = await carregarLogoEmail(empresa.logoUrl);
    const anexos: AnexoEmail[] = [];
    if (logoInline) {
      anexos.push({
        nome: logoInline.nome,
        conteudo: logoInline.conteudo,
        mime: logoInline.mime,
        cid: logoInline.cid,
      });
    }

    const html = layoutEmail(
      empresa,
      `<p>Este é um e-mail de teste da plataforma para <strong>${escapeHtml(
        empresa.nomeFantasia,
      )}</strong>.</p><p>Se você está lendo, o envio de e-mail está funcionando com sucesso.</p>`,
      {
        badgeTitulo: 'Teste de Conexão',
        temLogo: Boolean(logoInline),
      },
    );
    try {
      await this.mail.send(
        para,
        `Teste de e-mail — ${empresa.nomeFantasia}`,
        html,
        smtp,
        anexos,
      );
    } catch (erro) {
      throw new BadGatewayException(
        `O servidor de e-mail recusou o envio: ${(erro as Error).message}`,
      );
    }
    return { enviadoPara: para };
  }
}
