import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../../common/prisma/prisma.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { BoletoInvalidoError } from './boleto-codigo';
import { montarBoletoPdf } from './boleto-pdf';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import {
  calcularEncargos,
  foraDoPrazoDeReemissao,
  podeEmitirBoleto,
  PRAZO_MAXIMO_REEMISSAO_DIAS,
  type EncargosCalculados,
} from './boleto-atualizacao';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { TituloReceberQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  calcularStatusTituloReceber,
  inicioDoDia,
} from './titulo-receber-status';

const SORT_FIELDS = new Set(['numero', 'emissao', 'vencimento', 'valor', 'saldo', 'dtBaixa', 'createdAt']);

const CLIENTE_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };

// Consulta read-only com o mesmo escopo hierárquico de Clientes.
@Injectable()
export class TitulosReceberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contas: ContasBancariasService,
  ) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: TituloReceberQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      // Mesmo corte usado por calcularStatusTituloReceber — se o filtro do
      // banco e o cálculo do badge divergirem, a lista mostra "aberto" numa
      // busca por "vencido".
      const hoje = inicioDoDia();
      const condicoesStatus: Prisma.TituloReceberWhereInput[] = [];
      if (query.status === 'baixado') {
        condicoesStatus.push({ dtBaixa: { not: null } });
      } else if (query.status === 'aberto') {
        condicoesStatus.push(
          { dtBaixa: null },
          { OR: [{ vencimento: null }, { vencimento: { gte: hoje } }] },
        );
      } else if (query.status === 'vencido') {
        condicoesStatus.push({ dtBaixa: null }, { vencimento: { lt: hoje } });
      }
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(condicoesStatus.length ? { AND: condicoesStatus } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                {
                  cliente: {
                    razaoSocial: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'vencimento';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.tituloReceber.findMany({
          where,
          include: { cliente: CLIENTE_SELECT, vendedor: VENDEDOR_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.tituloReceber.count({ where }),
      ]);
      // A flag de boleto depende de existir conta de cobrança resolvível, e
      // a padrão é uma consulta só para a página inteira — não uma por linha.
      const temContaPadrao = !!(await tx.contaBancaria.findFirst({
        where: { empresaId, deletedAt: null, ativo: true, padrao: true },
        select: { id: true },
      }));
      const comStatus = data.map((titulo) => ({
        ...titulo,
        status: calcularStatusTituloReceber(titulo, hoje),
        temBoleto: podeEmitirBoleto(titulo, temContaPadrao),
      }));
      return buildPaginatedResult(comStatus, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const titulo = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { cliente: CLIENTE_SELECT, vendedor: VENDEDOR_SELECT },
      });
      if (!titulo) throw new NotFoundException('Título não encontrado');
      const temContaPadrao = !!(await tx.contaBancaria.findFirst({
        where: { empresaId, deletedAt: null, ativo: true, padrao: true },
        select: { id: true },
      }));
      return {
        ...titulo,
        status: calcularStatusTituloReceber(titulo, inicioDoDia()),
        temBoleto: podeEmitirBoleto(titulo, temContaPadrao),
      };
    });
  }

  /**
   * 2ª via do boleto em PDF (ver `docs/planos/segunda-via-danfe-boleto.md`).
   *
   * Reimpressão de cobrança já registrada: o nosso número vem do ERP e o
   * convênio vem do cadastro de contas bancárias. Se faltar qualquer um dos
   * dois, responde 409 explicando o que falta — em vez de imprimir um boleto
   * com dado inventado, que o cliente só descobre inválido no caixa.
   *
   * O valor impresso é o **saldo** do título, não o valor original: título
   * parcialmente baixado tem em aberto o que sobrou, e é isso que se cobra.
   *
   * A emissão entra no **histórico de atendimento do cliente** como atividade
   * concluída. `registrarEvento: false` desliga isso para quem vai registrar
   * um evento mais específico — é o caso do envio pela conversa de WhatsApp,
   * que grava "boleto enviado" e não "boleto gerado" (mesma convenção do PDF
   * de orçamento).
   */
  async gerarBoleto(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    opcoes: { registrarEvento?: boolean } = {},
  ) {
    const titulo = await this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const encontrado = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { cliente: true, contaBancaria: true },
      });
      if (!encontrado) throw new NotFoundException('Título não encontrado');
      return encontrado;
    });

    if (titulo.dtBaixa) {
      throw new ConflictException(
        `O título ${titulo.numero} já está baixado — não há 2ª via de boleto pago.`,
      );
    }

    // Janela de reemissão: passados 30 dias do vencimento a cobrança já está
    // em outro rito (negativação, protesto, acordo), e um boleto emitido aqui
    // atropelaria isso.
    if (foraDoPrazoDeReemissao(titulo.vencimento)) {
      throw new ConflictException(
        `O título ${titulo.numero} está vencido há mais de ${PRAZO_MAXIMO_REEMISSAO_DIAS} dias — ` +
          'a 2ª via não pode mais ser emitida pela plataforma. Fale com o financeiro.',
      );
    }

    const conta =
      titulo.contaBancaria ?? (await this.contas.contaPadrao(empresaId));
    if (!conta) {
      throw new ConflictException(
        'Nenhuma conta bancária cadastrada como padrão. Cadastre o convênio de ' +
          'cobrança em Administração › Contas Bancárias para emitir boletos.',
      );
    }

    // A empresa emitente não é tabela de tenant (não tem empresaId); é lida
    // fora da transação, como no PDF do orçamento.
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
    });

    const saldo = Number(titulo.saldo) > 0 ? Number(titulo.saldo) : Number(titulo.valor);
    // Vencido sai com valor atualizado (multa + juros pro rata), decisão do
    // usuário em 2026-08-21: reimprimir o valor original faria o cliente pagar
    // a menos e o título continuar aberto por diferença.
    const encargos = calcularEncargos({
      saldo,
      vencimento: titulo.vencimento,
      multaPerc: conta.multaPerc,
      jurosMesPerc: conta.jurosMesPerc,
    });
    const valor = encargos.valor;
    // Número como sai impresso na ficha e no histórico do cliente — uma
    // definição só, para os dois não divergirem.
    const numeroDocumento = [titulo.numero, titulo.parcela]
      .filter(Boolean)
      .join('/');

    try {
      const boleto = montarBoletoPdf({
        banco: { codigo: conta.banco, nome: nomeBanco(conta.banco) },
        beneficiario: {
          nome: conta.beneficiarioNome ?? empresa?.razaoSocial ?? '',
          documento: conta.beneficiarioDocumento ?? empresa?.cnpj ?? null,
          endereco:
            conta.beneficiarioEndereco ||
            [empresa?.endereco, empresa?.bairro, empresa?.municipio, empresa?.uf]
              .filter(Boolean)
              .join(', ') ||
            null,
          agenciaConta: formatarAgenciaConta(conta),
        },
        pagador: {
          nome: titulo.cliente?.razaoSocial ?? 'Cliente não identificado',
          documento: titulo.cliente?.cnpjCpf ?? null,
          endereco: [
            titulo.cliente?.endereco,
            titulo.cliente?.bairro,
            titulo.cliente?.municipio,
            titulo.cliente?.uf,
          ]
            .filter(Boolean)
            .join(', '),
        },
        titulo: {
          numeroDocumento,
          vencimento: titulo.vencimento,
          emissao: titulo.emissao,
          valor,
          carteira: titulo.carteira ?? conta.carteira,
          especieDocumento: conta.especieDocumento,
          aceite: conta.aceite,
        },
        localPagamento: conta.localPagamento,
        instrucoes: montarInstrucoes(conta, encargos),
        demonstrativo: conta.demonstrativo,
        codigo: {
          banco: conta.banco,
          agencia: conta.agencia,
          conta: conta.conta,
          carteira: titulo.carteira ?? conta.carteira,
          nossoNumero: titulo.nossoNumero ?? '',
          vencimento: titulo.vencimento,
          valor,
          // Em atraso com encargo aplicado, o código registrado pelo ERP não
          // serve: ele carrega o valor original, e o que se cobra agora é
          // outro. Fora isso, o do ERP continua prevalecendo.
          codigoBarrasErp: encargos.valor === encargos.saldo ? titulo.codigoBarras : null,
          linhaDigitavelErp:
            encargos.valor === encargos.saldo ? titulo.linhaDigitavel : null,
        },
      });

      // Registrado **depois** de o PDF existir: se a montagem falhasse, o
      // histórico do cliente ficaria com um "boleto gerado" que ninguém
      // recebeu.
      if (opcoes.registrarEvento !== false) {
        await this.prisma.withTenant(empresaId, (tx) =>
          registrarAtividadeDocumento(tx, {
            empresaId,
            autor: user.id,
            evento: 'boleto_gerado',
            clienteId: titulo.clienteId,
            vendedorId: titulo.vendedorId,
            numero: numeroDocumento,
            descricao: this.descreverBoleto(titulo.vencimento, encargos),
          }),
        );
      }

      return {
        ...boleto,
        nomeArquivo: `boleto-${titulo.numero}${titulo.parcela ?? ''}.pdf`,
        numero: titulo.numero,
        numeroDocumento,
        clienteId: titulo.clienteId,
        vendedorId: titulo.vendedorId,
        vencimento: titulo.vencimento,
        valor,
        encargos,
      };
    } catch (erro) {
      if (erro instanceof BoletoInvalidoError) {
        throw new ConflictException(
          `Não foi possível emitir o boleto do título ${titulo.numero}: ${erro.message}`,
        );
      }
      throw erro;
    }
  }

  /**
   * A linha que resume o boleto no histórico do cliente.
   *
   * Traz a composição quando há atraso: quem lê o histórico meses depois
   * precisa saber por que aquele boleto saiu com valor diferente do título.
   */
  descreverBoleto(vencimento: Date | null, encargos: EncargosCalculados) {
    const partes = [
      `Venc. ${vencimento ? vencimento.toLocaleDateString('pt-BR') : 'sem data'}`,
      real(encargos.valor),
    ];
    if (encargos.diasAtraso > 0) {
      partes.push(
        `valor atualizado — ${encargos.diasAtraso} dia(s) de atraso ` +
          `(original ${real(encargos.saldo)}, multa ${real(encargos.multa)}, ` +
          `juros ${real(encargos.juros)})`,
      );
    }
    return partes.join(' · ');
  }
}

/** Nome impresso no cabeçalho da ficha. Só os bancos com gerador implementado. */
function nomeBanco(codigo: string): string {
  return codigo === '237' ? 'BRADESCO' : codigo;
}

/** "1234-5 / 0567890-1" — como o banco imprime na ficha. */
function formatarAgenciaConta(conta: {
  agencia: string;
  agenciaDv: string | null;
  conta: string;
  contaDv: string | null;
}) {
  const agencia = conta.agenciaDv ? `${conta.agencia}-${conta.agenciaDv}` : conta.agencia;
  const numero = conta.contaDv ? `${conta.conta}-${conta.contaDv}` : conta.conta;
  return `${agencia} / ${numero}`;
}

/**
 * Instruções ao caixa: o texto livre do convênio, mais as linhas de encargo
 * derivadas dos percentuais cadastrados.
 *
 * Os encargos entram como **instrução**, não somados ao valor do documento: o
 * que se cobra depois do vencimento é calculado pelo banco na liquidação, e
 * embutir no valor mudaria o código de barras já registrado.
 */
function montarInstrucoes(
  conta: {
    instrucoes: string | null;
    multaPerc: number | null;
    jurosMesPerc: number | null;
    diasProtesto: number | null;
  },
  encargos: EncargosCalculados,
): string[] {
  const linhas: string[] = [];
  if (conta.instrucoes) linhas.push(...conta.instrucoes.split(/\r?\n/));

  // Título em atraso: o papel precisa mostrar como o valor foi composto. Sem
  // isso o cliente vê um valor diferente do que combinou e liga para o
  // vendedor — que é justamente a ligação que a 2ª via existe para evitar.
  if (encargos.diasAtraso > 0) {
    linhas.push(
      `Valor atualizado em ${encargos.atualizadoAte.toLocaleDateString('pt-BR')} ` +
        `(${encargos.diasAtraso} dia(s) de atraso).`,
    );
    linhas.push(`Valor original: ${real(encargos.saldo)}.`);
    if (encargos.multa > 0) {
      linhas.push(`Multa (${conta.multaPerc}%): ${real(encargos.multa)}.`);
    }
    if (encargos.juros > 0) {
      linhas.push(
        `Juros (${conta.jurosMesPerc}% ao mês, pro rata): ${real(encargos.juros)}.`,
      );
    }
    linhas.push(`Total a pagar: ${real(encargos.valor)}.`);
  } else {
    if (conta.multaPerc) {
      linhas.push(`Após o vencimento, cobrar multa de ${conta.multaPerc}%.`);
    }
    if (conta.jurosMesPerc) {
      linhas.push(`Após o vencimento, cobrar juros de ${conta.jurosMesPerc}% ao mês.`);
    }
  }

  if (conta.diasProtesto) {
    linhas.push(`Protestar após ${conta.diasProtesto} dias corridos do vencimento.`);
  }
  return linhas.filter((l) => l.trim().length > 0);
}

const real = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

