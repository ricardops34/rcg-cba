import { Injectable, NotFoundException } from '@nestjs/common';
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
  IntegracaoNotaEntrada,
  IntegracaoNotaEntradaCreate,
  IntegracaoNotaEntradaItem,
  IntegracaoNotaEntradaQuery,
  IntegracaoNotaEntradaUpdate,
  IntegracaoNotaEntradaLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import { criarFilhos, sincronizarFilhos } from '../common/sincronizar-filhos';

const INCLUDE = {
  fornecedor: { select: { codigoErp: true } },
  condicaoPagamento: { select: { codigoErp: true } },
  itens: {
    include: {
      produto: { select: { codigoErp: true } },
      armazem: { select: { codigoErp: true } },
    },
  },
} satisfies Prisma.NotaEntradaInclude;
type NotaComRelacoes = Prisma.NotaEntradaGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoNotasEntradaService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: NotaComRelacoes): IntegracaoNotaEntrada {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      fornecedorCodigo: row.fornecedor?.codigoErp ?? null,
      condicaoCodigo: row.condicaoPagamento?.codigoErp ?? null,
      numero: row.numero,
      serie: row.serie,
      especieFiscal: row.especieFiscal,
      tipo: row.tipo,
      dtEmissao: row.dtEmissao,
      dtEntrada: row.dtEntrada,
      vlrBruto: row.vlrBruto,
      vlrMercadoria: row.vlrMercadoria,
      vlrItens: row.vlrItens,
      vlrDesconto: row.vlrDesconto,
      vlrIcms: row.vlrIcms,
      vlrIcmsSt: row.vlrIcmsSt,
      vlrIpi: row.vlrIpi,
      vlrFrete: row.vlrFrete,
      chaveNfe: row.chaveNfe,
      dtNfe: row.dtNfe,
      mensagem: row.mensagem,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        delete: false,
        codigoErp: item.codigoErp ?? '',
        produtoCodigo: item.produto?.codigoErp ?? null,
        armazemCodigo: item.armazem?.codigoErp ?? null,
        item: item.item,
        cfop: item.cfop,
        ncm: item.ncm,
        quantidade: item.quantidade,
        vlrUnitario: item.vlrUnitario,
        vlrDesconto: item.vlrDesconto,
        vlrTotal: item.vlrTotal,
        vlrIcms: item.vlrIcms,
        vlrIcmsSt: item.vlrIcmsSt,
        vlrIpi: item.vlrIpi,
        peso: item.peso,
        ativo: item.ativo,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoNotaEntradaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.fornecedorCodigo
          ? { fornecedor: { codigoErp: query.fornecedorCodigo } }
          : {}),
        ...(query.search
          ? { numero: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.notaEntrada.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.notaEntrada.count({ where }),
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
  ): Promise<IntegracaoNotaEntrada> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.notaEntrada.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Nota de entrada não encontrada');
      return this.paraLeitura(row);
    });
  }

  /**
   * `fornecedorId`, `dtEmissao`, `ano` e `mes` são denormalizados do cabeçalho
   * para dentro de cada item — o payload do item não os traz.
   */
  private async montarItens(
    tx: TenantTx,
    empresaId: string,
    itens: IntegracaoNotaEntradaItem[],
    fornecedorId: string | null,
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
        let armazemId: string | null = null;
        if (item.armazemCodigo) {
          const armazem = await tx.armazem.findFirst({
            where: {
              empresaId,
              codigoErp: item.armazemCodigo,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!armazem) {
            throw new NotFoundException(
              `itens[].armazemCodigo '${item.armazemCodigo}' não encontrado`,
            );
          }
          armazemId = armazem.id;
        }
        return {
          delete: item.delete,
          empresaId,
          codigoErp: item.codigoErp,
          fornecedorId,
          produtoId,
          armazemId,
          item: item.item ?? null,
          dtEmissao,
          ano: dtEmissao?.getUTCFullYear() ?? null,
          mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
          cfop: item.cfop ?? null,
          ncm: item.ncm ?? null,
          quantidade: item.quantidade,
          vlrUnitario: item.vlrUnitario,
          vlrDesconto: item.vlrDesconto,
          vlrTotal: item.vlrTotal,
          vlrIcms: item.vlrIcms,
          vlrIcmsSt: item.vlrIcmsSt,
          vlrIpi: item.vlrIpi,
          peso: item.peso ?? null,
          ativo: item.ativo,
        };
      }),
    );
  }

  private async resolverRefs(
    tx: TenantTx,
    empresaId: string,
    fornecedorCodigo: string | null | undefined,
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
    const fornecedorId = await resolver(
      fornecedorCodigo,
      () =>
        tx.fornecedor.findFirst({
          where: { empresaId, codigoErp: fornecedorCodigo!, deletedAt: null },
          select: { id: true },
        }),
      'fornecedorCodigo',
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
    return { fornecedorId, condicaoPagamentoId };
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoNotaEntradaCreate,
  ): Promise<IntegracaoNotaEntrada> {
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu** — só o
   * lote precisa disso, para separar `criados` de `atualizados`.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoNotaEntradaCreate,
  ): Promise<{ registro: IntegracaoNotaEntrada; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaEntrada.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const { fornecedorId, condicaoPagamentoId } = await this.resolverRefs(
        tx,
        empresaId,
        input.fornecedorCodigo,
        input.condicaoCodigo,
      );
      const dtEmissao = input.dtEmissao ?? null;
      const itensData = await this.montarItens(
        tx,
        empresaId,
        input.itens,
        fornecedorId,
        dtEmissao,
      );

      const dados = {
        codigoErp: input.codigoErp,
        fornecedorId,
        condicaoPagamentoId,
        numero: input.numero,
        serie: input.serie ?? null,
        especieFiscal: input.especieFiscal ?? null,
        tipo: input.tipo ?? null,
        dtEmissao,
        dtEntrada: input.dtEntrada ?? null,
        ano: dtEmissao?.getUTCFullYear() ?? null,
        mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
        vlrBruto: input.vlrBruto,
        vlrMercadoria: input.vlrMercadoria,
        vlrItens: input.vlrItens,
        vlrDesconto: input.vlrDesconto,
        vlrIcms: input.vlrIcms,
        vlrIcmsSt: input.vlrIcmsSt,
        vlrIpi: input.vlrIpi,
        vlrFrete: input.vlrFrete,
        chaveNfe: input.chaveNfe ?? null,
        dtNfe: input.dtNfe ?? null,
        mensagem: input.mensagem ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        // Item que veio é casado pelo codigoErp em vez de recriado; item
        // ausente do payload não é excluído (ver `sincronizarFilhos`).
        const atualizadaUpsert = await tx.notaEntrada.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            itens: sincronizarFilhos(empresaId, itensData),
          },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadaUpsert), decisao };
      }

      const criada = await tx.notaEntrada.create({
        data: {
          ...dados,
          empresaId,
          createdBy: autor,
          itens: { create: criarFilhos(itensData) },
        },
        include: INCLUDE,
      });
      return { registro: this.paraLeitura(criada), decisao };
    });
  }

  /**
   * Aplica um lote. Ver `processarLote` para a ordem e o tratamento de erro.
   *
   * A reativação conta como `atualizado`: a linha já existia e mantém o mesmo
   * uuid — quem lê o relatório está conferindo quantos registros novos
   * entraram, e um código que volta do soft delete não é um deles.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoNotaEntradaLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.codigoErp);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoNotaEntradaCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoNotaEntradaUpdate,
  ): Promise<IntegracaoNotaEntrada> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaEntrada.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Nota de entrada não encontrada');

      const { fornecedorId, condicaoPagamentoId } = await this.resolverRefs(
        tx,
        empresaId,
        input.fornecedorCodigo,
        input.condicaoCodigo,
      );
      const dtEmissao =
        input.dtEmissao !== undefined ? input.dtEmissao : undefined;

      let itensUpdate: Record<string, unknown> = {};
      if (input.itens) {
        // Os itens são denormalizados a partir dos valores **finais** do
        // cabeçalho: o que o PATCH mandou, ou o que já estava gravado.
        const fornecedorIdFinal =
          input.fornecedorCodigo !== undefined
            ? fornecedorId
            : existente.fornecedorId;
        const dtEmissaoFinal =
          dtEmissao !== undefined ? dtEmissao : existente.dtEmissao;
        const itensData = await this.montarItens(
          tx,
          empresaId,
          input.itens,
          fornecedorIdFinal,
          dtEmissaoFinal,
        );
        itensUpdate = { itens: sincronizarFilhos(empresaId, itensData) };
      }

      const atualizada = await tx.notaEntrada.update({
        where: { id: existente.id },
        data: {
          ...(input.fornecedorCodigo !== undefined ? { fornecedorId } : {}),
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
          ...(input.dtEntrada !== undefined
            ? { dtEntrada: input.dtEntrada }
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
          ...(input.vlrIcmsSt !== undefined
            ? { vlrIcmsSt: input.vlrIcmsSt }
            : {}),
          ...(input.vlrIpi !== undefined ? { vlrIpi: input.vlrIpi } : {}),
          ...(input.vlrFrete !== undefined ? { vlrFrete: input.vlrFrete } : {}),
          ...(input.chaveNfe !== undefined ? { chaveNfe: input.chaveNfe } : {}),
          ...(input.dtNfe !== undefined ? { dtNfe: input.dtNfe } : {}),
          ...(input.mensagem !== undefined ? { mensagem: input.mensagem } : {}),
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
      const existente = await tx.notaEntrada.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Nota de entrada não encontrada');
      await tx.notaEntrada.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
