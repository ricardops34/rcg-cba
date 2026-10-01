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
  layoutEmail,
} from '../../common/mail/email-layout';
import { escapeHtml } from '../../common/html/escape-html';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ParametrosService } from '../parametros/parametros.service';
import { NotasSaidaService } from '../notas-saida/notas-saida.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';

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
 * 2ª via e cobrança por e-mail
 * (docs/planos/2026-10-01-envio-email-documentos-cobranca.md).
 *
 * Três regras:
 *
 * 1. **O destinatário é o e-mail do cadastro do cliente**, sempre. Não há
 *    campo de endereço na rota — nota fiscal e boleto só vão para quem é dono
 *    deles.
 * 2. **Os documentos saem dos serviços da tela** (`gerarDanfe`, `obterXml`,
 *    `gerarBoleto`, `findAll`), com o usuário que pede: a carteira dele vale
 *    sem ser reimplementada aqui, e o PDF é o mesmo que ele baixaria.
 * 3. **O envio é a ação.** Diferente do e-mail de senha, falha de SMTP volta
 *    para a tela com o motivo — e só um envio que saiu vai para o histórico.
 */
@Injectable()
export class DocumentosEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly parametros: ParametrosService,
    private readonly notas: NotasSaidaService,
    private readonly titulos: TitulosReceberService,
  ) {}

  // -------------------------------------------------------------------------
  // DANFE + XML
  // -------------------------------------------------------------------------

  async enviarNota(
    empresaId: string,
    user: AuthenticatedUser,
    notaId: string,
    input: EnviarNotaEmail,
  ): Promise<EnvioEmailResultado> {
    // O histórico recebe "DANFE enviado por e-mail", não "gerado": uma ação,
    // um registro.
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

    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const numero = String(danfe.numero);
    const assunto = `NF ${numero} — ${empresa.nomeFantasia}`;
    const corpo = `
      <p>Olá, ${escapeHtml(cliente.razaoSocial)}!</p>
      <p>Segue a 2ª via da <strong>nota fiscal ${escapeHtml(numero)}</strong>${
        input.incluirXml
          ? ', com o DANFE em PDF e o arquivo XML'
          : ', com o DANFE em PDF'
      }.</p>
      ${
        danfe.cancelada
          ? '<p style="color:#b91c1c"><strong>Atenção: esta nota fiscal está CANCELADA.</strong></p>'
          : ''
      }
      <p style="font-size:12px;color:#555">Chave de acesso: ${escapeHtml(
        String(danfe.chave).replace(/(\d{4})(?=\d)/g, '$1 '),
      )}</p>`;

    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo),
      anexos,
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
    const boleto = await this.titulos.gerarBoleto(
      empresaId,
      { tipo: 'usuario', user },
      tituloId,
      { registrarEvento: false, atualizado: input.atualizado },
    );
    const cliente = await this.cliente(empresaId, boleto.clienteId);
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);

    const atrasado = boleto.encargos.diasAtraso > 0;
    const assunto = `Boleto do título ${boleto.numeroDocumento} — ${empresa.nomeFantasia}`;
    const corpo = `
      <p>Olá, ${escapeHtml(cliente.razaoSocial)}!</p>
      <p>Segue a 2ª via do boleto do <strong>título ${escapeHtml(boleto.numeroDocumento)}</strong>.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 12px 2px 0"><strong>${
          atrasado
            ? 'Valor atualizado até ' + dataBr(boleto.encargos.atualizadoAte)
            : 'Vencimento'
        }:</strong></td><td>${atrasado ? moeda(boleto.valor) : dataBr(boleto.vencimento)}</td></tr>
        ${atrasado ? '' : `<tr><td style="padding:2px 12px 2px 0"><strong>Valor:</strong></td><td>${moeda(boleto.valor)}</td></tr>`}
        <tr><td style="padding:2px 12px 2px 0"><strong>Linha digitável:</strong></td><td style="font-family:Consolas,monospace">${escapeHtml(
          boleto.linhaDigitavelFormatada,
        )}</td></tr>
      </table>`;

    const anexos: AnexoEmail[] = [
      {
        nome: boleto.nomeArquivo,
        conteudo: boleto.conteudo,
        mime: 'application/pdf',
      },
    ];
    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo),
      anexos,
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

  /**
   * Posição dos títulos vencidos do cliente, com o boleto atualizado de cada
   * um e o DANFE da nota de origem.
   *
   * Título não aponta para nota: a nota é a de mesmo número e mesmo cliente
   * (o prefixo do título não é a série). Só vai DANFE de nota com XML, e uma
   * vez por número — várias parcelas são da mesma nota.
   *
   * Um documento que não pôde ser gerado não impede a cobrança: o título vai
   * na tabela, e o motivo volta em `avisos`.
   */
  async enviarCobranca(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ): Promise<EnvioEmailResultado> {
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
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const linhas = titulos
      .map((t) => {
        const venc = t.vencimentoEfetivo ?? t.vencimento;
        return `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(nomeTitulo(t))}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee">${dataBr(venc)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${diasDeAtraso(venc)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${moeda(Number(t.saldo ?? 0))}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;color:#555">${
            semBoleto.has(t.id)
              ? 'Boleto indisponível — fale conosco'
              : 'Boleto em anexo'
          }</td>
        </tr>`;
      })
      .join('');
    const assunto = `Títulos em atraso — ${empresa.nomeFantasia}`;
    const corpo = `
      <p>Olá, ${escapeHtml(cliente.razaoSocial)}!</p>
      <p>Consta em nosso sistema o(s) título(s) abaixo em atraso. Caso o pagamento já
      tenha sido feito, por favor desconsidere esta mensagem.</p>
      <table style="border-collapse:collapse;margin:12px 0;font-size:13px">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:6px 8px;text-align:left">Título</th>
          <th style="padding:6px 8px;text-align:left">Vencimento</th>
          <th style="padding:6px 8px;text-align:right">Dias em atraso</th>
          <th style="padding:6px 8px;text-align:right">Saldo</th>
          <th style="padding:6px 8px;text-align:left">Boleto</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr>
          <td colspan="3" style="padding:6px 8px;text-align:right"><strong>Total</strong></td>
          <td style="padding:6px 8px;text-align:right"><strong>${moeda(total)}</strong></td>
          <td></td>
        </tr></tfoot>
      </table>
      <p style="font-size:12px;color:#555">Os boletos em anexo estão com o valor atualizado
      (juros e multa) até hoje. Seguem também os DANFEs das notas fiscais de origem.</p>`;

    await this.enviar(
      empresaId,
      cliente.emails,
      assunto,
      layoutEmail(empresa, corpo),
      anexos,
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
  ) {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mail.configurado(smtp)) {
      throw new ConflictException(
        'Envio de e-mail não configurado. Preencha os parâmetros SMTP em Administração > Parâmetros.',
      );
    }
    try {
      await this.mail.send(para, assunto, html, smtp, anexos);
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
