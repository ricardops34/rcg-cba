import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoNfeXml,
  IntegracaoNfeXmlResultado,
  IntegracaoNfeXmlStatus,
  IntegracaoNotaSaida,
  IntegracaoNotaSaidaCreate,
  IntegracaoNotaSaidaItem,
  IntegracaoNotaSaidaQuery,
  IntegracaoNotaSaidaUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';
import { criarFilhos, sincronizarFilhos } from '../common/sincronizar-filhos';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';
import {
  extrairNfe,
  NFE_XML_MAX_BYTES,
  NfeXmlInvalidoError,
} from '../../notas-saida/nfe-xml';

const INCLUDE = {
  cliente: { select: { codigoErp: true } },
  vendedor: { select: { codigoErp: true } },
  condicaoPagamento: { select: { codigoErp: true } },
  itens: {
    include: {
      produto: { select: { codigoErp: true } },
      regraDesconto: { select: { codigoErp: true } },
    },
  },
} satisfies Prisma.NotaSaidaInclude;
type NotaComRelacoes = Prisma.NotaSaidaGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoNotasSaidaService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: NotaComRelacoes): IntegracaoNotaSaida {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      clienteCodigo: row.cliente?.codigoErp ?? null,
      vendedorCodigo: row.vendedor?.codigoErp ?? null,
      condicaoCodigo: row.condicaoPagamento?.codigoErp ?? null,
      numero: row.numero,
      serie: row.serie,
      especieFiscal: row.especieFiscal,
      tipo: row.tipo,
      dtEmissao: row.dtEmissao,
      vlrBruto: row.vlrBruto,
      vlrMercadoria: row.vlrMercadoria,
      vlrItens: row.vlrItens,
      vlrDesconto: row.vlrDesconto,
      vlrIcms: row.vlrIcms,
      vlrIpi: row.vlrIpi,
      vlrFrete: row.vlrFrete,
      vlrDevolucao: row.vlrDevolucao,
      chaveNfe: row.chaveNfe,
      dtNfe: row.dtNfe,
      mensagem: row.mensagem,
      comodato: row.comodato,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        delete: false,
        codigoErp: item.codigoErp ?? '',
        produtoCodigo: item.produto?.codigoErp ?? null,
        item: item.item,
        cfop: item.cfop,
        tipo: item.tipo,
        quantidade: item.quantidade,
        vlrUnitario: item.vlrUnitario,
        vlrTabela: item.vlrTabela,
        percDesconto: item.percDesconto,
        vlrDesconto: item.vlrDesconto,
        vlrTotal: item.vlrTotal,
        quantidadeDev: item.quantidadeDev,
        vlrDev: item.vlrDev,
        peso: item.peso,
        comodato: item.comodato,
        percComissao: item.percComissao,
        regraDescontoCodigo: item.regraDesconto?.codigoErp ?? null,
        ativo: item.ativo,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoNotaSaidaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        // O filtro olha `xmlRecebidoEm`, e não a existência da linha em
        // `nota_saida_xml`: é uma coluna da própria tabela, então a varredura
        // de "o que falta enviar" não vira um join na tabela dos XMLs.
        ...(query.semXml === true ? { xmlRecebidoEm: null } : {}),
        ...(query.semXml === false ? { xmlRecebidoEm: { not: null } } : {}),
        ...(query.search
          ? { numero: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.notaSaida.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.notaSaida.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(
    empresaId: string,
    codigoErp: string,
  ): Promise<IntegracaoNotaSaida> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Nota de saída não encontrada');
      return this.paraLeitura(row);
    });
  }

  private async montarItens(
    tx: TenantTx,
    empresaId: string,
    itens: IntegracaoNotaSaidaItem[],
    clienteId: string | null,
    vendedorId: string | null,
    dtEmissao: Date | null,
  ) {
    return Promise.all(
      itens.map(async (item) => {
        let produtoId: string | null = null;
        if (item.produtoCodigo) {
          const produto = await tx.produto.findFirst({
            where: {
              empresaId,
              codigoErp: item.produtoCodigo,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!produto) {
            throw new NotFoundException(
              `itens[].produtoCodigo '${item.produtoCodigo}' não encontrado`,
            );
          }
          produtoId = produto.id;
        }
        return {
          delete: item.delete,
          empresaId,
          codigoErp: item.codigoErp,
          clienteId,
          vendedorId,
          produtoId,
          item: item.item ?? null,
          dtEmissao,
          ano: dtEmissao?.getUTCFullYear() ?? null,
          mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
          cfop: item.cfop ?? null,
          tipo: item.tipo ?? null,
          quantidade: item.quantidade,
          vlrUnitario: item.vlrUnitario,
          vlrTabela: item.vlrTabela ?? null,
          percDesconto: item.percDesconto ?? null,
          vlrDesconto: item.vlrDesconto,
          vlrTotal: item.vlrTotal,
          quantidadeDev: item.quantidadeDev ?? null,
          vlrDev: item.vlrDev ?? null,
          peso: item.peso ?? null,
          comodato: item.comodato,
          percComissao: item.percComissao ?? null,
          regraDescontoId:
            (await resolverRegraDesconto(
              tx,
              empresaId,
              item.regraDescontoCodigo,
            )) ?? null,
          ativo: item.ativo,
        };
      }),
    );
  }

  private async resolverRefs(
    tx: TenantTx,
    empresaId: string,
    clienteCodigo: string | null | undefined,
    vendedorCodigo: string | null | undefined,
    condicaoCodigo: string | null | undefined,
  ) {
    const resolver = async (
      codigo: string | null | undefined,
      finder: () => Promise<{ id: string } | null>,
      campo: string,
    ) => {
      if (!codigo) return null;
      const row = await finder();
      if (!row)
        throw new NotFoundException(`${campo} '${codigo}' não encontrado`);
      return row.id;
    };
    const clienteId = await resolver(
      clienteCodigo,
      () =>
        tx.cliente.findFirst({
          where: { empresaId, codigoErp: clienteCodigo!, deletedAt: null },
          select: { id: true },
        }),
      'clienteCodigo',
    );
    const vendedorId = await resolver(
      vendedorCodigo,
      () =>
        tx.vendedor.findFirst({
          where: { empresaId, codigoErp: vendedorCodigo!, deletedAt: null },
          select: { id: true },
        }),
      'vendedorCodigo',
    );
    const condicaoPagamentoId = await resolver(
      condicaoCodigo,
      () =>
        tx.condicaoPagamento.findFirst({
          where: { empresaId, codigoErp: condicaoCodigo!, deletedAt: null },
          select: { id: true },
        }),
      'condicaoCodigo',
    );
    return { clienteId, vendedorId, condicaoPagamentoId };
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoNotaSaidaCreate,
  ): Promise<IntegracaoNotaSaida> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const { clienteId, vendedorId, condicaoPagamentoId } =
        await this.resolverRefs(
          tx,
          empresaId,
          input.clienteCodigo,
          input.vendedorCodigo,
          input.condicaoCodigo,
        );
      const dtEmissao = input.dtEmissao ?? null;
      const itensData = await this.montarItens(
        tx,
        empresaId,
        input.itens,
        clienteId,
        vendedorId,
        dtEmissao,
      );

      const dados = {
          codigoErp: input.codigoErp,
          clienteId,
          vendedorId,
          condicaoPagamentoId,
          numero: input.numero,
          serie: input.serie ?? null,
          especieFiscal: input.especieFiscal ?? null,
          tipo: input.tipo ?? null,
          dtEmissao,
          ano: dtEmissao?.getUTCFullYear() ?? null,
          mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
          vlrBruto: input.vlrBruto,
          vlrMercadoria: input.vlrMercadoria,
          vlrItens: input.vlrItens,
          vlrDesconto: input.vlrDesconto,
          vlrIcms: input.vlrIcms,
          vlrIpi: input.vlrIpi,
          vlrFrete: input.vlrFrete,
          vlrDevolucao: input.vlrDevolucao,
          chaveNfe: input.chaveNfe ?? null,
          dtNfe: input.dtNfe ?? null,
          mensagem: input.mensagem ?? null,
          comodato: input.comodato,
          ativo: input.ativo,
          updatedBy: autor,
      };

      if (decisao !== 'criar') {
        // O ERP manda a nota inteira: item que não veio mais não existe mais,
        // e o que veio é casado pelo codigoErp em vez de recriado.
        const atualizadoUpsert = await tx.notaSaida.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            itens: sincronizarFilhos(empresaId, itensData),
          },
          include: INCLUDE,
        });
        return this.paraLeitura(atualizadoUpsert);
      }

      const criada = await tx.notaSaida.create({
        data: {
          ...dados,
          empresaId,
          createdBy: autor,
          itens: { create: criarFilhos(itensData) },
        },
        include: INCLUDE,
      });
      return this.paraLeitura(criada);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoNotaSaidaUpdate,
  ): Promise<IntegracaoNotaSaida> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Nota de saída não encontrada');

      const { clienteId, vendedorId, condicaoPagamentoId } =
        await this.resolverRefs(
          tx,
          empresaId,
          input.clienteCodigo,
          input.vendedorCodigo,
          input.condicaoCodigo,
        );
      const dtEmissao =
        input.dtEmissao !== undefined ? input.dtEmissao : undefined;

      let itensUpdate: Record<string, unknown> = {};
      if (input.itens) {
        const clienteIdFinal =
          input.clienteCodigo !== undefined ? clienteId : existente.clienteId;
        const vendedorIdFinal =
          input.vendedorCodigo !== undefined
            ? vendedorId
            : existente.vendedorId;
        const dtEmissaoFinal =
          dtEmissao !== undefined ? dtEmissao : existente.dtEmissao;
        const itensData = await this.montarItens(
          tx,
          empresaId,
          input.itens,
          clienteIdFinal,
          vendedorIdFinal,
          dtEmissaoFinal,
        );
        itensUpdate = { itens: sincronizarFilhos(empresaId, itensData) };
      }

      const atualizada = await tx.notaSaida.update({
        where: { id: existente.id },
        data: {
          ...(input.clienteCodigo !== undefined ? { clienteId } : {}),
          ...(input.vendedorCodigo !== undefined ? { vendedorId } : {}),
          ...(input.condicaoCodigo !== undefined
            ? { condicaoPagamentoId }
            : {}),
          ...(input.numero !== undefined ? { numero: input.numero } : {}),
          ...(input.serie !== undefined ? { serie: input.serie } : {}),
          ...(input.especieFiscal !== undefined
            ? { especieFiscal: input.especieFiscal }
            : {}),
          ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
          ...(dtEmissao !== undefined
            ? {
                dtEmissao,
                ano: dtEmissao?.getUTCFullYear() ?? null,
                mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
              }
            : {}),
          ...(input.vlrBruto !== undefined ? { vlrBruto: input.vlrBruto } : {}),
          ...(input.vlrMercadoria !== undefined
            ? { vlrMercadoria: input.vlrMercadoria }
            : {}),
          ...(input.vlrItens !== undefined ? { vlrItens: input.vlrItens } : {}),
          ...(input.vlrDesconto !== undefined
            ? { vlrDesconto: input.vlrDesconto }
            : {}),
          ...(input.vlrIcms !== undefined ? { vlrIcms: input.vlrIcms } : {}),
          ...(input.vlrIpi !== undefined ? { vlrIpi: input.vlrIpi } : {}),
          ...(input.vlrFrete !== undefined ? { vlrFrete: input.vlrFrete } : {}),
          ...(input.vlrDevolucao !== undefined
            ? { vlrDevolucao: input.vlrDevolucao }
            : {}),
          ...(input.chaveNfe !== undefined ? { chaveNfe: input.chaveNfe } : {}),
          ...(input.dtNfe !== undefined ? { dtNfe: input.dtNfe } : {}),
          ...(input.mensagem !== undefined ? { mensagem: input.mensagem } : {}),
          ...(input.comodato !== undefined ? { comodato: input.comodato } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
          ...itensUpdate,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizada);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Nota de saída não encontrada');
      await tx.notaSaida.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  /**
   * Recebe o XML autorizado da NF-e e o guarda para a 2ª via do DANFE
   * (ver `docs/planos/segunda-via-danfe-boleto.md`).
   *
   * O arquivo é lido **antes** de tocar o banco: XML que não é NF-e, ou sem
   * chave de 44 dígitos, é recusado na hora — guardar primeiro e descobrir na
   * hora da 2ª via jogaria o erro para o vendedor, na frente do cliente.
   *
   * A chave também é conferida contra a que a nota já tem. Divergência aqui
   * quase sempre é `codigoErp` trocado no ERP, e aceitar significaria
   * pendurar o XML de uma nota em outra — o cliente receberia a nota de
   * outra pessoa.
   */
  async salvarXml(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoNfeXml,
  ): Promise<IntegracaoNfeXmlResultado> {
    const autor = autorIntegracao(apiKeyId);

    const conteudo =
      input.xml ?? Buffer.from(input.xmlBase64 ?? '', 'base64').toString('utf8');
    const tamanho = Buffer.byteLength(conteudo, 'utf8');
    if (tamanho > NFE_XML_MAX_BYTES) {
      throw new ConflictException(
        `XML acima do limite de ${Math.round(NFE_XML_MAX_BYTES / 1024 / 1024)} MB`,
      );
    }

    let dados;
    try {
      dados = extrairNfe(conteudo);
    } catch (erro) {
      throw new ConflictException(
        erro instanceof NfeXmlInvalidoError
          ? erro.message
          : 'Não foi possível ler o XML enviado',
      );
    }

    const nota = await this.prisma.withTenant(empresaId, (tx) =>
      tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        select: { id: true, chaveNfe: true },
      }),
    );
    if (!nota) throw new NotFoundException('Nota de saída não encontrada');

    const chaveAtual = (nota.chaveNfe ?? '').replace(/\D/g, '');
    if (chaveAtual && chaveAtual !== dados.chave) {
      throw new ConflictException(
        `A chave do XML (${dados.chave}) não confere com a da nota ${codigoErp} (${chaveAtual})`,
      );
    }

    const situacao = dados.cancelada
      ? 'cancelada'
      : dados.protocolo
        ? 'autorizada'
        : 'sem_protocolo';
    const recebidoEm = new Date();

    // Numa transação só: o XML e os metadados da nota que dizem que ele
    // existe (`xmlRecebidoEm`, situação, protocolo) não podem divergir. Era
    // exatamente essa janela que a versão em disco deixava aberta.
    await this.prisma.withTenant(empresaId, async (tx) => {
      await tx.notaSaidaXml.upsert({
        where: { notaSaidaId: nota.id },
        // Reenvio substitui: a nota autorizada é uma só, e guardar versões
        // antigas de um documento fiscal corrigido só cria dúvida.
        update: {
          conteudo,
          tamanhoBytes: tamanho,
          recebidoEm,
          recebidoPor: autor,
        },
        create: {
          empresaId,
          notaSaidaId: nota.id,
          conteudo,
          tamanhoBytes: tamanho,
          recebidoEm,
          recebidoPor: autor,
        },
      });

      await tx.notaSaida.update({
        where: { id: nota.id },
        data: {
          xmlRecebidoEm: recebidoEm,
          protocoloNfe: dados.protocolo,
          situacaoNfe: situacao,
          // A chave só é gravada quando faltava: nota importada do legado
          // costuma vir sem ela, e é o XML que a traz.
          ...(chaveAtual ? {} : { chaveNfe: dados.chave }),
          updatedBy: autor,
        },
      });
    });

    return {
      codigoErp,
      chaveNfe: dados.chave,
      numero: dados.numero,
      serie: dados.serie,
      protocolo: dados.protocolo,
      situacao,
      recebidoEm: recebidoEm.toISOString(),
    };
  }

  /**
   * O que a plataforma tem do XML desta nota.
   *
   * É como o ERP confere se a entrega chegou — inclusive depois de uma carga
   * que falhou no meio. `comConteudo` devolve o arquivo; sem ele, só os
   * metadados, porque numa varredura de milhares de notas o conteúdo seria o
   * maior tráfego da integração sem que ninguém precise dele.
   */
  async statusXml(
    empresaId: string,
    codigoErp: string,
    comConteudo = false,
  ): Promise<IntegracaoNfeXmlStatus> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const nota = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        select: {
          id: true,
          chaveNfe: true,
          protocoloNfe: true,
          situacaoNfe: true,
          xmlRecebidoEm: true,
        },
      });
      if (!nota) throw new NotFoundException('Nota de saída não encontrada');

      const xml = await tx.notaSaidaXml.findUnique({
        where: { notaSaidaId: nota.id },
        select: {
          tamanhoBytes: true,
          recebidoEm: true,
          ...(comConteudo ? { conteudo: true } : {}),
        },
      });

      return {
        codigoErp,
        temXml: !!xml,
        chaveNfe: nota.chaveNfe,
        protocolo: nota.protocoloNfe,
        situacao: nota.situacaoNfe,
        recebidoEm: (xml?.recebidoEm ?? nota.xmlRecebidoEm)?.toISOString() ?? null,
        tamanhoBytes: xml?.tamanhoBytes ?? null,
        ...(comConteudo
          ? { conteudo: (xml as { conteudo?: string } | null)?.conteudo ?? null }
          : {}),
      };
    });
  }

  /**
   * Remove o XML de uma nota.
   *
   * Existe para o caso real: o ERP mandou o arquivo no `codigoErp` errado e
   * a nota ficou com o XML de outra. Sem isto, o único jeito de corrigir seria
   * no banco, à mão.
   *
   * Os metadados da nota voltam a zero junto — deixar `situacaoNfe` preenchida
   * sem XML faria a tela oferecer uma 2ª via que não existe.
   */
  async removerXml(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const nota = await tx.notaSaida.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        select: { id: true },
      });
      if (!nota) throw new NotFoundException('Nota de saída não encontrada');

      const removidos = await tx.notaSaidaXml.deleteMany({
        where: { notaSaidaId: nota.id },
      });
      if (removidos.count === 0) {
        throw new NotFoundException('Esta nota não tem XML na plataforma');
      }

      await tx.notaSaida.update({
        where: { id: nota.id },
        data: {
          xmlRecebidoEm: null,
          protocoloNfe: null,
          situacaoNfe: null,
          updatedBy: autor,
        },
      });
    });
  }
}
