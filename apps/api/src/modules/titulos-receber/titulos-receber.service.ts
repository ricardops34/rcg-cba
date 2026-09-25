import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../../common/prisma/prisma.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import {
  ParametrosService,
  PARAMETRO_BOLETO_PRAZO_MAXIMO_REEMISSAO,
} from '../parametros/parametros.service';
import { BoletoInvalidoError } from './boleto-codigo';
import { montarBoletoPdf } from './boleto-pdf';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import {
  calcularEncargos,
  diasEmAtraso,
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
  autorDoEvento,
  recorteDoSolicitante,
  type QuemPede,
} from '../../common/escopo/quem-pede';
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
    private readonly parametros: ParametrosService,
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
      } else if (query.status === 'em_aberto') {
        condicoesStatus.push({ dtBaixa: null });
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
      const prazoMaximoReemissao = await this.parametros.obterNumero(
        empresaId,
        PARAMETRO_BOLETO_PRAZO_MAXIMO_REEMISSAO,
        60,
        tx,
      );
      const comStatus = data.map((titulo) => ({
        ...titulo,
        status: calcularStatusTituloReceber(titulo, hoje),
        temBoleto: podeEmitirBoleto(titulo, temContaPadrao, hoje, prazoMaximoReemissao),
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
        include: {
          cliente: CLIENTE_SELECT,
          vendedor: VENDEDOR_SELECT,
          // Só no detalhe: na listagem seriam N linhas por título.
          baixas: { orderBy: { data: 'asc' } },
        },
      });
      if (!titulo) throw new NotFoundException('Título não encontrado');
      const temContaPadrao = !!(await tx.contaBancaria.findFirst({
        where: { empresaId, deletedAt: null, ativo: true, padrao: true },
        select: { id: true },
      }));
      const prazoMaximoReemissao = await this.parametros.obterNumero(
        empresaId,
        PARAMETRO_BOLETO_PRAZO_MAXIMO_REEMISSAO,
        60,
        tx,
      );
      return {
        ...titulo,
        status: calcularStatusTituloReceber(titulo, inicioDoDia()),
        temBoleto: podeEmitirBoleto(titulo, temContaPadrao, inicioDoDia(), prazoMaximoReemissao),
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
    quem: QuemPede,
    id: string,
    opcoes: { registrarEvento?: boolean; atualizado?: boolean } = {},
  ) {
    const titulo = await this.prisma.withTenant(empresaId, async (tx) => {
      // O recorte muda com quem pede: o usuário alcança a carteira dele; o
      // cliente no WhatsApp alcança só os títulos dele. As regras abaixo
      // (baixado, janela de reemissão, encargos) valem igual nos dois.
      const recorte = await recorteDoSolicitante(tx, empresaId, quem);
      const encontrado = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(recorte.escopoVendedores
            ? { vendedorId: { in: recorte.escopoVendedores } }
            : {}),
          ...(recorte.clienteId ? { clienteId: recorte.clienteId } : {}),
        },
        include: { cliente: true, contaBancaria: true },
      });
      if (!encontrado) throw new NotFoundException('Título não encontrado');
      return encontrado;
    });

    const prazoMaximoReemissao = await this.parametros.obterNumero(
      empresaId,
      PARAMETRO_BOLETO_PRAZO_MAXIMO_REEMISSAO,
      60,
    );

    // Janela de reemissão: passados os dias configurados do vencimento a cobrança já está
    // em outro rito (negativação, protesto, acordo), e um boleto emitido aqui atropelaria isso.
    if (foraDoPrazoDeReemissao(titulo.vencimento, new Date(), prazoMaximoReemissao)) {
      throw new ConflictException(
        `O título ${titulo.numero} está vencido há mais de ${prazoMaximoReemissao} dias — ` +
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
    const emAtraso = diasEmAtraso(titulo.vencimento) > 0;
    const usarAtualizado = opcoes.atualizado !== false && emAtraso;
    const encargos = usarAtualizado
      ? calcularEncargos({
          saldo,
          vencimento: titulo.vencimento,
          multaPerc: conta.multaPerc,
          jurosMesPerc: conta.jurosMesPerc,
          multaValor: titulo.multaValor,
          jurosValorDia: titulo.jurosValorDia,
        })
      : {
          valor: saldo,
          saldo,
          multa: 0,
          juros: 0,
          diasAtraso: 0,
          atualizadoAte: inicioDoDia(),
        };
    const valor = encargos.valor;
    const dataVencimentoBoleto = usarAtualizado ? encargos.atualizadoAte : titulo.vencimento;
    const marcaDagua = titulo.dtBaixa ? 'TÍTULO BAIXADO' : null;

    // Número como sai impresso na ficha e no histórico do cliente — uma
    // definição só, para os dois não divergirem.
    const numeroDocumento = [titulo.numero, titulo.parcela]
      .filter(Boolean)
      .join('/');

    try {
      // Precedência em todo campo abaixo: **título, depois conta, depois
      // empresa**. Quem registrou o boleto no banco foi o ERP, e o papel na mão
      // do cliente foi impresso com os dados dele. A conta de cobrança segue
      // valendo para título antigo, que não traz o desenho completo.
      const boleto = await montarBoletoPdf({
        banco: {
          codigo: titulo.banco ?? conta.banco,
          nome:
            titulo.bancoCodigoCompensacao ??
            titulo.bancoNome ??
            nomeBanco(titulo.banco ?? conta.banco),
          logoUrl: conta.logoUrl,
        },
        beneficiario: {
          nome:
            titulo.beneficiarioNome ?? conta.beneficiarioNome ?? empresa?.razaoSocial ?? '',
          documento:
            titulo.beneficiarioDocumento ??
            conta.beneficiarioDocumento ??
            empresa?.cnpj ??
            null,
          endereco:
            titulo.beneficiarioEndereco ||
            conta.beneficiarioEndereco ||
            [empresa?.endereco, empresa?.bairro, empresa?.municipio, empresa?.uf]
              .filter(Boolean)
              .join(', ') ||
            null,
          agenciaConta: formatarAgenciaConta(titulo, conta),
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
          vencimento: dataVencimentoBoleto,
          emissao: titulo.emissao,
          valor,
          carteira: titulo.carteira ?? conta.carteira,
          especieDocumento: titulo.especieDocumento ?? conta.especieDocumento,
          aceite: titulo.aceite ?? conta.aceite,
          impressoPor: quem.tipo === 'usuario' ? quem.user.nome : 'Plataforma',
        },
        localPagamento: titulo.localPagamento ?? conta.localPagamento,
        instrucoes: montarInstrucoes(titulo, conta, encargos, usarAtualizado),
        demonstrativo: conta.demonstrativo,
        marcaDagua,
        codigo: {
          banco: titulo.banco ?? conta.banco,
          agencia: titulo.agencia ?? conta.agencia,
          conta: titulo.conta ?? conta.conta,
          carteira: titulo.carteira ?? conta.carteira,
          nossoNumero: titulo.nossoNumero ?? '',
          vencimento: dataVencimentoBoleto,
          valor,
          codigoBarrasErp: usarAtualizado ? null : titulo.codigoBarras,
          linhaDigitavelErp: usarAtualizado ? null : titulo.linhaDigitavel,
        },
      });

      // Registrado **depois** de o PDF existir: se a montagem falhasse, o
      // histórico do cliente ficaria com um "boleto gerado" que ninguém
      // recebeu.
      if (opcoes.registrarEvento !== false) {
        await this.prisma.withTenant(empresaId, (tx) =>
          registrarAtividadeDocumento(tx, {
            empresaId,
            autor: autorDoEvento(quem),
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

/**
 * Agência e conta formatadas no padrão do ERP (ex.: 2201-2/00145750).
 */
function formatarAgenciaConta(
  titulo: {
    agencia: string | null;
    agenciaDv: string | null;
    conta: string | null;
    contaDv: string | null;
  },
  conta: {
    agencia: string;
    agenciaDv: string | null;
    conta: string;
    contaDv: string | null;
  },
) {
  const origem =
    titulo.agencia && titulo.conta
      ? {
          agencia: titulo.agencia,
          agenciaDv: titulo.agenciaDv,
          conta: titulo.conta,
          contaDv: titulo.contaDv,
        }
      : conta;

  const agenciaStr = (origem.agencia ?? '').trim();
  const agenciaDvStr = (origem.agenciaDv ?? '').trim();
  const contaStr = (origem.conta ?? '').trim();
  const contaDvStr = (origem.contaDv ?? '').trim();

  const agencia = agenciaDvStr ? `${agenciaStr}-${agenciaDvStr}` : agenciaStr;

  // No ERP Bradesco, Agência/Código Beneficiário é impresso como 2201-2/00145750
  // (conta com 7 dígitos + DV = 8 dígitos sem espaço)
  const contaDigitos = contaStr.replace(/\D/g, '');
  let contaFormatada = contaStr;
  if (contaDvStr) {
    const comDv = `${contaDigitos}${contaDvStr}`;
    contaFormatada = comDv.length < 8 ? comDv.padStart(8, '0') : comDv;
  } else if (contaDigitos.length < 8) {
    contaFormatada = contaDigitos.padStart(8, '0');
  }

  return `${agencia}/${contaFormatada}`;
}

/**
 * Instruções ao caixa: o texto livre do convênio, mais as linhas de encargo
 * no formato padrão ERP.
 */
function montarInstrucoes(
  titulo: {
    instrucoes: string | null;
    multaValor: number | null;
    jurosValorDia: number | null;
  },
  conta: {
    instrucoes: string | null;
    multaPerc: number | null;
    jurosMesPerc: number | null;
    diasProtesto: number | null;
  },
  encargos: EncargosCalculados,
  usarAtualizado?: boolean,
): string[] {
  const linhas: string[] = [];

  // 1. Instruções de encargo (formato do ERP Bradesco)
  const jurosDia = titulo.jurosValorDia ?? (encargos.saldo * (conta.jurosMesPerc ?? 0) / 100 / 30);
  const multaVal = titulo.multaValor ?? (encargos.saldo * (conta.multaPerc ?? 0) / 100);

  if (jurosDia > 0) {
    linhas.push(`Importancia por Dia de Atraso de ${moedaFormato(jurosDia)}`);
  }
  if (multaVal > 0) {
    linhas.push(`Após Vencimento Cobrar Multa de ${moedaFormato(multaVal)}`);
  }

  linhas.push(' - - - 2º Via - - -');

  if (usarAtualizado) {
    linhas.push('Boleto atualizado para pagamento apenas nesta data.');
  }

  // 2. Instruções do cadastro de conta e do título
  if (conta.instrucoes) linhas.push(...conta.instrucoes.split(/\r?\n/));
  if (titulo.instrucoes) linhas.push(...titulo.instrucoes.split(/\r?\n/));

  if (conta.diasProtesto) {
    linhas.push(`Protestar após ${conta.diasProtesto} dias corridos do vencimento.`);
  }

  return linhas.filter((l) => l.trim().length > 0);
}

function moedaFormato(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const real = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
