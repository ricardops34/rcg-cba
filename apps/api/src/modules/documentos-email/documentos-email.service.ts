import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  EnviarBoletoEmail,
  EnviarNotaEmail,
  EnvioEmailResultado,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService, type AnexoEmail } from '../../common/mail/mail.service';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import {
  buscarEmpresaDoEmail,
  carregarLogoEmail,
  layoutEmail,
  type RemetenteEmail,
} from '../../common/mail/email-layout';
import { escapeHtml } from '../../common/html/escape-html';
import {
  substituirTags,
  formatarTextoHtml,
  type TagsContextoEmail,
} from '../../common/mail/substituir-tags';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ParametrosService } from '../parametros/parametros.service';
import { NotasSaidaService } from '../notas-saida/notas-saida.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { EmailConfigService } from '../email/email-config.service';

/** Teto de títulos numa cobrança: o e-mail tem limite de tamanho. */
const MAX_TITULOS_COBRANCA = 30;

type TituloLinha = {
  id: string;
  numero: string;
  parcela: string | null;
  prefixo: string | null;
  vencimento: string | Date | null;
  vencimentoEfetivo?: string | Date | null;
  saldo: number;
  temBoleto: boolean;
};

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data civil, sem fuso: o vencimento é uma data, não um instante. */
const dataBr = (v: string | Date | null | undefined) => {
  if (!v) return '';
  const iso = v instanceof Date ? v.toISOString() : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const diasDeAtraso = (v: string | Date | null | undefined) => {
  if (!v) return 0;
  const iso = (v instanceof Date ? v.toISOString() : v).slice(0, 10);
  const venc = Date.parse(`${iso}T00:00:00Z`);
  const hoje = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((hoje - venc) / 86_400_000));
};

/**
 * 2ª via e cobrança por e-mail com identidade visual da empresa e assinatura do colaborador.
 */
@Injectable()
export class DocumentosEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly parametros: ParametrosService,
    private readonly notas: NotasSaidaService,
    private readonly titulos: TitulosReceberService,
    private readonly emailConfig: EmailConfigService,
  ) {}

  /** Carrega configurações de template, logo e dados do colaborador para o envio. */
  private async obterContextoEnvio(empresaId: string, user: AuthenticatedUser) {
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const modelos = await this.emailConfig.obterModelos(empresaId);
    const logoInline = await carregarLogoEmail(empresa.logoUrl);

    let remetente: RemetenteEmail | null = null;
    let usuarioEmail: string | undefined = undefined;

    if (modelos.incluirAssinaturaUsuario || modelos.replyToUsuario) {
      const u = await this.prisma.usuario.findUnique({
        where: { id: user.id },
        select: {
          nome: true,
          nomeReduzido: true,
          email: true,
          telefone: true,
          celular: true,
          perfil: { select: { nome: true } },
        },
      });
      if (u) {
        usuarioEmail = u.email;
        if (modelos.incluirAssinaturaUsuario) {
          remetente = {
            nome: u.nomeReduzido || u.nome,
            cargo: u.perfil?.nome || (user.isAdmin ? 'Administração' : 'Departamento Comercial'),
            email: modelos.incluirEmailUsuario ? u.email : null,
            telefone: modelos.incluirTelefoneUsuario ? (u.celular || u.telefone) : null,
          };
        }
      }
    }

    return {
      empresa,
      modelos,
      logoInline,
      remetente,
      replyTo: modelos.replyToUsuario ? usuarioEmail : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // DANFE + XML
  // -------------------------------------------------------------------------

  async enviarNota(
    empresaId: string,
    user: AuthenticatedUser,
    notaId: string,
    input: EnviarNotaEmail,
  ): Promise<EnvioEmailResultado> {
    await this.emailConfig.exigir(empresaId, 'documentos');
    const danfe = await this.notas.gerarDanfe(
      empresaId,
      { tipo: 'usuario', user },
      notaId,
      { registrarEvento: false },
    );
    const cliente = await this.cliente(empresaId, danfe.clienteId);

    const anexos: AnexoEmail[] = [
      {
        nome: danfe.nomeArquivo,
        conteudo: danfe.conteudo,
        mime: 'application/pdf',
      },
    ];
    const avisos: string[] = [];
    if (input.incluirXml) {
      const xml = await this.notas.obterXml(empresaId, user, notaId, {
        registrarEvento: false,
      });
      anexos.push({
        nome: xml.nomeArquivo,
        conteudo: xml.conteudo,
        mime: 'application/xml',
      });
    }

    const { empresa, modelos, logoInline, remetente, replyTo } =
      await this.obterContextoEnvio(empresaId, user);

    if (logoInline) {
      anexos.push({
        nome: logoInline.nome,
        conteudo: logoInline.conteudo,
        mime: logoInline.mime,
        cid: logoInline.cid,
      });
    }

    const numero = String(danfe.numero);
    const chaveFormatada = String(danfe.chave).replace(/(\d{4})(?=\d)/g, '$1 ');
    const tagsCtx: TagsContextoEmail = {
      cliente: {
        nome: cliente.razaoSocial,
        razaoSocial: cliente.razaoSocial,
      },
      empresa: {
        nomeFantasia: empresa.nomeFantasia,
        razaoSocial: empresa.razaoSocial,
        telefone: empresa.telefone,
        email: empresa.email,
      },
      colaborador: remetente
        ? {
            nome: remetente.nome,
            cargo: remetente.cargo,
            telefone: remetente.telefone,
            email: remetente.email,
          }
        : undefined,
      nota: {
        numero,
        chave: chaveFormatada,
      },
    };

    const assunto = substituirTags(modelos.notaAssunto, tagsCtx);
    const aberturaTexto = substituirTags(modelos.notaTexto, tagsCtx);

    const corpo = `
      <p>Prezado(a) <strong>${escapeHtml(cliente.razaoSocial)}</strong>,</p>
      <p>${formatarTextoHtml(aberturaTexto)}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:16px 0">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:bold">Documento Fiscal</div>
        <div style="font-size:15px;font-weight:bold;color:#0f172a;margin-top:4px">Nota Fiscal Eletrônica nº ${escapeHtml(
          numero,
        )}</div>
        <div style="font-size:12px;color:#475569;margin-top:6px">Chave de acesso: <span style="font-family:monospace;color:#1e40af">${escapeHtml(
          chaveFormatada,
        )}</span></div>
      </div>
      ${
        danfe.cancelada
          ? '<p style="color:#b91c1c;font-weight:bold">Atenção: esta nota fiscal está CANCELADA na SEFAZ.</p>'
          : ''
      }
      <p style="font-size:12px;color:#64748b">Anexos inclusos: <code>${escapeHtml(
        danfe.nomeArquivo,
      )}</code>${input.incluirXml ? ' e o arquivo XML' : ''}.</p>`;

    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo, {
        remetente,
        corCabecalho: modelos.corCabecalho,
        badgeTitulo: 'Documento Fiscal',
        temLogo: Boolean(logoInline),
      }),
      anexos,
      replyTo,
    );

    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'danfe_email',
        clienteId: danfe.clienteId,
        vendedorId: danfe.vendedorId,
        numero,
        descricao: [
          `Enviado para ${cliente.emails.join(', ')}`,
          input.incluirXml ? 'com o XML' : null,
          danfe.cancelada ? 'NOTA CANCELADA' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    );

    return {
      enviadoPara: cliente.emails,
      anexos: anexos.map((a) => a.nome),
      avisos,
    };
  }

  // -------------------------------------------------------------------------
  // Boleto
  // -------------------------------------------------------------------------

  async enviarBoleto(
    empresaId: string,
    user: AuthenticatedUser,
    tituloId: string,
    input: EnviarBoletoEmail,
  ): Promise<EnvioEmailResultado> {
    await this.emailConfig.exigir(empresaId, 'boleto');
    const boleto = await this.titulos.gerarBoleto(
      empresaId,
      { tipo: 'usuario', user },
      tituloId,
      { registrarEvento: false, atualizado: input.atualizado },
    );
    const cliente = await this.cliente(empresaId, boleto.clienteId);

    const { empresa, modelos, logoInline, remetente, replyTo } =
      await this.obterContextoEnvio(empresaId, user);

    const anexos: AnexoEmail[] = [
      {
        nome: boleto.nomeArquivo,
        conteudo: boleto.conteudo,
        mime: 'application/pdf',
      },
    ];
    if (logoInline) {
      anexos.push({
        nome: logoInline.nome,
        conteudo: logoInline.conteudo,
        mime: logoInline.mime,
        cid: logoInline.cid,
      });
    }

    const atrasado = boleto.encargos.diasAtraso > 0;
    const tagsCtx: TagsContextoEmail = {
      cliente: {
        nome: cliente.razaoSocial,
        razaoSocial: cliente.razaoSocial,
      },
      empresa: {
        nomeFantasia: empresa.nomeFantasia,
        razaoSocial: empresa.razaoSocial,
        telefone: empresa.telefone,
        email: empresa.email,
      },
      colaborador: remetente
        ? {
            nome: remetente.nome,
            cargo: remetente.cargo,
            telefone: remetente.telefone,
            email: remetente.email,
          }
        : undefined,
      boleto: {
        numero: boleto.numeroDocumento,
        vencimento: atrasado
          ? dataBr(boleto.encargos.atualizadoAte)
          : dataBr(boleto.vencimento),
        valor: moeda(boleto.valor),
        linhaDigitavel: boleto.linhaDigitavelFormatada,
      },
    };

    const assunto = substituirTags(modelos.boletoAssunto, tagsCtx);
    const aberturaTexto = substituirTags(modelos.boletoTexto, tagsCtx);

    const corpo = `
      <p>Prezado(a) <strong>${escapeHtml(cliente.razaoSocial)}</strong>,</p>
      <p>${formatarTextoHtml(aberturaTexto)}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:16px 0">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Título:</td><td style="padding:4px 0;font-weight:bold;color:#0f172a">${escapeHtml(
            boleto.numeroDocumento,
          )}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">${
            atrasado
              ? 'Valor atualizado até ' + dataBr(boleto.encargos.atualizadoAte)
              : 'Vencimento'
          }:</td><td style="padding:4px 0;font-weight:bold;color:#0f172a">${
            atrasado ? moeda(boleto.valor) : dataBr(boleto.vencimento)
          }</td></tr>
          ${
            atrasado
              ? ''
              : `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Valor:</td><td style="padding:4px 0;font-weight:bold;color:#0f172a">${moeda(
                  boleto.valor,
                )}</td></tr>`
          }
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Linha digitável:</td><td style="padding:4px 0;font-family:Consolas,monospace;font-size:11px;color:#1e40af">${escapeHtml(
            boleto.linhaDigitavelFormatada,
          )}</td></tr>
        </table>
      </div>
      <p style="font-size:12px;color:#64748b">O boleto para pagamento segue anexado em formato PDF.</p>`;

    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo, {
        remetente,
        corCabecalho: modelos.corCabecalho,
        badgeTitulo: 'Cobrança Bancária',
        temLogo: Boolean(logoInline),
      }),
      anexos,
      replyTo,
    );

    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'boleto_email',
        clienteId: boleto.clienteId,
        vendedorId: boleto.vendedorId,
        numero: boleto.numeroDocumento,
        descricao: `Enviado para ${cliente.emails.join(', ')} · ${this.titulos.descreverBoleto(
          boleto.vencimento,
          boleto.encargos,
        )}`,
      }),
    );

    return {
      enviadoPara: cliente.emails,
      anexos: [boleto.nomeArquivo],
      avisos: [],
    };
  }

  // -------------------------------------------------------------------------
  // Cobrança
  // -------------------------------------------------------------------------

  async enviarCobranca(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ): Promise<EnvioEmailResultado> {
    await this.emailConfig.exigir(empresaId, 'cobranca');
    const cliente = await this.cliente(empresaId, clienteId);
    const resultado = (await this.titulos.findAll(empresaId, user, {
      page: 1,
      pageSize: MAX_TITULOS_COBRANCA,
      sortBy: 'vencimento',
      sortOrder: 'asc',
      status: 'vencido',
      ativo: true,
      clienteId,
    } as never)) as { data: TituloLinha[]; total?: number };
    const titulos = resultado.data ?? [];
    if (titulos.length === 0) {
      throw new ConflictException('Este cliente não tem títulos vencidos.');
    }

    const anexos: AnexoEmail[] = [];
    const avisos: string[] = [];
    const nomeTitulo = (t: TituloLinha) =>
      `${t.numero}${t.parcela ? `/${t.parcela}` : ''}`;

    // Boletos atualizados
    const semBoleto = new Set<string>();
    for (const t of titulos) {
      if (!t.temBoleto) {
        semBoleto.add(t.id);
        avisos.push(`Título ${nomeTitulo(t)}: sem 2ª via de boleto`);
        continue;
      }
      try {
        const boleto = await this.titulos.gerarBoleto(
          empresaId,
          { tipo: 'usuario', user },
          t.id,
          { registrarEvento: false, atualizado: true },
        );
        anexos.push({
          nome: boleto.nomeArquivo,
          conteudo: boleto.conteudo,
          mime: 'application/pdf',
        });
      } catch (erro) {
        semBoleto.add(t.id);
        avisos.push(`Título ${nomeTitulo(t)}: ${(erro as Error).message}`);
      }
    }

    // DANFEs das notas de origem
    const notas = await this.notasDosTitulos(empresaId, clienteId, titulos);
    for (const nota of notas) {
      try {
        const danfe = await this.notas.gerarDanfe(
          empresaId,
          { tipo: 'usuario', user },
          nota.id,
          { registrarEvento: false },
        );
        anexos.push({
          nome: danfe.nomeArquivo,
          conteudo: danfe.conteudo,
          mime: 'application/pdf',
        });
      } catch (erro) {
        avisos.push(`NF ${nota.numero}: ${(erro as Error).message}`);
      }
    }

    const total = titulos.reduce((soma, t) => soma + Number(t.saldo ?? 0), 0);
    const { empresa, modelos, logoInline, remetente, replyTo } =
      await this.obterContextoEnvio(empresaId, user);

    if (logoInline) {
      anexos.push({
        nome: logoInline.nome,
        conteudo: logoInline.conteudo,
        mime: logoInline.mime,
        cid: logoInline.cid,
      });
    }

    const tagsCtx: TagsContextoEmail = {
      cliente: {
        nome: cliente.razaoSocial,
        razaoSocial: cliente.razaoSocial,
      },
      empresa: {
        nomeFantasia: empresa.nomeFantasia,
        razaoSocial: empresa.razaoSocial,
        telefone: empresa.telefone,
        email: empresa.email,
      },
      colaborador: remetente
        ? {
            nome: remetente.nome,
            cargo: remetente.cargo,
            telefone: remetente.telefone,
            email: remetente.email,
          }
        : undefined,
      cobranca: {
        quantidade: titulos.length,
        total: moeda(total),
      },
    };

    const assunto = substituirTags(modelos.cobrancaAssunto, tagsCtx);
    const aberturaTexto = substituirTags(modelos.cobrancaTexto, tagsCtx);

    const linhas = titulos
      .map((t) => {
        const venc = t.vencimentoEfetivo ?? t.vencimento;
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#0f172a">${escapeHtml(
            nomeTitulo(t),
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${dataBr(
            venc,
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right"><span style="background:#fef2f2;color:#b91c1c;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">${diasDeAtraso(
            venc,
          )} dias</span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#0f172a">${moeda(
            Number(t.saldo ?? 0),
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:${
            semBoleto.has(t.id) ? '#64748b' : '#16a34a'
          }">${semBoleto.has(t.id) ? 'Fale conosco' : 'Em anexo'}</td>
        </tr>`;
      })
      .join('');

    const corpo = `
      <p>Prezado(a) <strong>${escapeHtml(cliente.razaoSocial)}</strong>,</p>
      <p>${formatarTextoHtml(aberturaTexto)}</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <thead><tr style="background:#f1f5f9;color:#475569">
          <th style="padding:8px 12px;text-align:left">Título</th>
          <th style="padding:8px 12px;text-align:left">Vencimento</th>
          <th style="padding:8px 12px;text-align:right">Atraso</th>
          <th style="padding:8px 12px;text-align:right">Saldo</th>
          <th style="padding:8px 12px;text-align:left">Boleto</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr style="background:#f8fafc;border-top:2px solid #cbd5e1">
          <td colspan="3" style="padding:8px 12px;text-align:right;font-weight:bold;color:#64748b">Total em Aberto:</td>
          <td style="padding:8px 12px;text-align:right;font-weight:bold;color:#0f172a;font-size:14px">${moeda(
            total,
          )}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <p style="font-size:12px;color:#64748b;font-style:italic">Os boletos em anexo estão com o valor atualizado (juros e multa) até hoje. Seguem também os DANFEs das notas fiscais de origem.</p>`;

    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo, {
        remetente,
        corCabecalho: modelos.corCabecalho,
        badgeTitulo: 'Cobrança Comercial',
        temLogo: Boolean(logoInline),
      }),
      anexos,
      replyTo,
    );

    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'cobranca_email',
        clienteId,
        vendedorId: null,
        numero: '',
        descricao: [
          `Enviado para ${cliente.emails.join(', ')}`,
          `${titulos.length} título(s) vencido(s) · ${moeda(total)}`,
          `${anexos.length} anexo(s)`,
          avisos.length ? `${avisos.length} sem documento` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    );

    return {
      enviadoPara: cliente.emails,
      anexos: anexos.map((a) => a.nome),
      avisos,
    };
  }

  // -------------------------------------------------------------------------
  // Apoio
  // -------------------------------------------------------------------------

  /** Cliente e os e-mails do cadastro — sem e-mail não há para quem mandar. */
  private async cliente(empresaId: string, clienteId: string | null) {
    if (!clienteId) {
      throw new BadRequestException('O documento não tem cliente vinculado.');
    }
    const cliente = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.findFirst({
        where: { id: clienteId, empresaId, deletedAt: null },
        select: { razaoSocial: true, email: true },
      }),
    );
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    const emails = extrairEmails(cliente.email);
    if (emails.length === 0) {
      throw new ConflictException(
        `O cliente ${cliente.razaoSocial} não tem e-mail válido no cadastro.`,
      );
    }
    return { razaoSocial: cliente.razaoSocial, emails };
  }

  /** Notas com XML de mesmo número dos títulos, uma por número. */
  private async notasDosTitulos(
    empresaId: string,
    clienteId: string,
    titulos: TituloLinha[],
  ) {
    const numeros = new Set<string>();
    for (const t of titulos) {
      const limpo = t.numero.trim().replace(/^0+/, '');
      if (!limpo) continue;
      numeros.add(limpo);
      numeros.add(limpo.padStart(6, '0'));
      numeros.add(limpo.padStart(9, '0'));
      numeros.add(t.numero.trim());
    }
    if (numeros.size === 0) return [];
    const notas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.notaSaida.findMany({
        where: {
          empresaId,
          clienteId,
          deletedAt: null,
          numero: { in: [...numeros] },
          xmlRecebidoEm: { not: null },
        },
        select: { id: true, numero: true },
        orderBy: { dtEmissao: 'asc' },
      }),
    );
    const vistos = new Set<string>();
    return notas.filter((n) => {
      const chave = n.numero.replace(/^0+/, '');
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  private async enviar(
    empresaId: string,
    para: string[],
    assunto: string,
    html: string,
    anexos: AnexoEmail[],
    replyTo?: string | null,
  ) {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mail.configurado(smtp)) {
      throw new ConflictException(
        'Envio de e-mail não configurado. Preencha os parâmetros SMTP em Administração > Parâmetros.',
      );
    }
    try {
      await this.mail.send(para, assunto, html, smtp, anexos, replyTo);
    } catch (erro) {
      throw new BadGatewayException(
        `O servidor de e-mail recusou o envio: ${(erro as Error).message}`,
      );
    }
  }
}

/** E-mails do cadastro: aceita vários, separados por `;`, `,` ou espaço. */
export function extrairEmails(valor: string | null | undefined): string[] {
  return [
    ...new Set(
      (valor ?? '')
        .split(/[;,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    ),
  ];
}
