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
  fornecedor: { select: { chave: true } },
  cliente: { select: { chave: true } },
  condicaoPagamento: { select: { chave: true } },
  itens: {
    include: {
      produto: { select: { chave: true } },
      armazem: { select: { chave: true } },
    },
  },
} satisfies Prisma.NotaEntradaInclude;
type NotaComRelacoes = Prisma.NotaEntradaGetPayload<{
  include: typeof INCLUDE;
}>;

/**
 * Tipos de nota de entrada (F1_TIPO) cujo participante é cliente, não
 * fornecedor. Ver `resolverRefs`.
 */
const TIPOS_DE_CLIENTE = ['D'];

@Injectable()
export class IntegracaoNotasEntradaService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: NotaComRelacoes): IntegracaoNotaEntrada {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      fornecedorChave: row.fornecedor?.chave ?? null,
      clienteChave: row.cliente?.chave ?? null,
      condicaoChave: row.condicaoPagamento?.chave ?? null,
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
      vlrSeguro: row.vlrSeguro,
      vlrDespesa: row.vlrDespesa,
      chaveNfe: row.chaveNfe,
      dtNfe: row.dtNfe,
      mensagem: row.mensagem,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        delete: false,
        chave: item.chave ?? '',
        produtoChave: item.produto?.chave ?? null,
        armazemChave: item.armazem?.chave ?? null,
        item: item.item,
        cfop: item.cfop,
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
        ...(query.fornecedorChave
          ? { fornecedor: { chave: query.fornecedorChave } }
          : {}),
        ...(query.clienteChave
          ? { cliente: { chave: query.clienteChave } }
          : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.search
          ? { numero: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.notaEntrada.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { chave: 'asc' },
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
    chave: string,
  ): Promise<IntegracaoNotaEntrada> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.notaEntrada.findFirst({
        where: { empresaId, chave, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Nota de entrada não encontrada');
      return this.paraLeitura(row);
    });
  }

  /**
   * `fornecedorId`, `clienteId`, `dtEmissao`, `ano` e `mes` são denormalizados
   * do cabeçalho para dentro de cada item — o payload do item não os traz.
   */
  private async montarItens(
    tx: TenantTx,
    empresaId: string,
    itens: IntegracaoNotaEntradaItem[],
    fornecedorId: string | null,
    clienteId: string | null,
    dtEmissao: Date | null,
  ) {
    return Promise.all(
      itens.map(async (item) => {
        let produtoId: string | null = null;
        if (item.produtoChave) {
          const produto = await tx.produto.findFirst({
            where: {
              empresaId,
              chave: item.produtoChave,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!produto) {
            throw new NotFoundException(
              `itens[].produtoChave '${item.produtoChave}' não encontrado`,
            );
          }
          produtoId = produto.id;
        }
        let armazemId: string | null = null;
        if (item.armazemChave) {
          const armazem = await tx.armazem.findFirst({
            where: {
              empresaId,
              chave: item.armazemChave,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!armazem) {
            throw new NotFoundException(
              `itens[].armazemChave '${item.armazemChave}' não encontrado`,
            );
          }
          armazemId = armazem.id;
        }
        return {
          delete: item.delete,
          empresaId,
          chave: item.chave,
          fornecedorId,
          clienteId,
          produtoId,
          armazemId,
          item: item.item ?? null,
          dtEmissao,
          ano: dtEmissao?.getUTCFullYear() ?? null,
          mes: dtEmissao ? dtEmissao.getUTCMonth() + 1 : null,
          cfop: item.cfop ?? null,
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

  /**
   * Resolve os códigos do ERP em uuid. `tipo` decide quem é o participante, e
   * só a chave dele é lida: na devolução de venda ('D') o F1_FORNECE é um
   * **cliente** (SA1); nos demais tipos, fornecedor. A chave do outro lado é
   * ignorada — antes a plataforma resolvia o que viesse, e um código de SA1
   * mandado como fornecedor (ou o contrário) caía no cadastro errado ou dava
   * 404. Espelho da nota de saída, onde a devolução de compra aponta para o
   * fornecedor.
   */
  private async resolverRefs(
    tx: TenantTx,
    empresaId: string,
    fornecedorChave: string | null | undefined,
    clienteChave: string | null | undefined,
    condicaoChave: string | null | undefined,
    tipo: string | null | undefined,
  ) {
    if (TIPOS_DE_CLIENTE.includes(tipo?.trim() ?? '')) {
      fornecedorChave = null;
    } else {
      clienteChave = null;
    }
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
      fornecedorChave,
      () =>
        tx.fornecedor.findFirst({
          where: { empresaId, chave: fornecedorChave!, deletedAt: null },
          select: { id: true },
        }),
      'fornecedorChave',
    );
    const clienteId = await resolver(
      clienteChave,
      () =>
        tx.cliente.findFirst({
          where: { empresaId, chave: clienteChave!, deletedAt: null },
          select: { id: true },
        }),
      'clienteChave',
    );
    const condicaoPagamentoId = await resolver(
      condicaoChave,
      () =>
        tx.condicaoPagamento.findFirst({
          where: { empresaId, chave: condicaoChave!, deletedAt: null },
          select: { id: true },
        }),
      'condicaoChave',
    );
    return { fornecedorId, clienteId, condicaoPagamentoId };
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
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const { fornecedorId, clienteId, condicaoPagamentoId } =
        await this.resolverRefs(
          tx,
          empresaId,
          input.fornecedorChave,
          input.clienteChave,
          input.condicaoChave,
          input.tipo,
        );
      const dtEmissao = input.dtEmissao ?? null;
      const itensData = await this.montarItens(
        tx,
        empresaId,
        input.itens,
        fornecedorId,
        clienteId,
        dtEmissao,
      );

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? null,
        fornecedorId,
        clienteId,
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
        vlrSeguro: input.vlrSeguro,
        vlrDespesa: input.vlrDespesa,
        chaveNfe: input.chaveNfe ?? null,
        dtNfe: input.dtNfe ?? null,
        mensagem: input.mensagem ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        // Item que veio é casado pela chave em vez de recriado; item
        // ausente do payload não é excluído (ver `sincronizarFilhos`).
        const atualizadaUpsert = await tx.notaEntrada.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            itens: sincronizarFilhos(
              { campo: 'notaEntradaId', id: existente!.id },
              itensData,
            ),
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
        await this.remove(empresaId, apiKeyId, item.chave);
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
    chave: string,
    input: IntegracaoNotaEntradaUpdate,
  ): Promise<IntegracaoNotaEntrada> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaEntrada.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Nota de entrada não encontrada');

      const tipoFinal = input.tipo !== undefined ? input.tipo : existente.tipo;
      const ehDeCliente = TIPOS_DE_CLIENTE.includes(tipoFinal?.trim() ?? '');
      const { fornecedorId, clienteId, condicaoPagamentoId } =
        await this.resolverRefs(
          tx,
          empresaId,
          input.fornecedorChave,
          input.clienteChave,
          input.condicaoChave,
          tipoFinal,
        );
      const dtEmissao =
        input.dtEmissao !== undefined ? input.dtEmissao : undefined;

      // O lado que o tipo descarta é sempre gravado nulo, mesmo sem vir no
      // PATCH; o lado que ele escolhe só muda quando a chave veio.
      const gravaFornecedor =
        input.fornecedorChave !== undefined || ehDeCliente;
      const gravaCliente = input.clienteChave !== undefined || !ehDeCliente;

      let itensUpdate: Record<string, unknown> = {};
      if (input.itens) {
        // Os itens são denormalizados a partir dos valores **finais** do
        // cabeçalho: o que o PATCH mandou, ou o que já estava gravado.
        const fornecedorIdFinal = gravaFornecedor
          ? fornecedorId
          : existente.fornecedorId;
        const clienteIdFinal = gravaCliente ? clienteId : existente.clienteId;
        const dtEmissaoFinal =
          dtEmissao !== undefined ? dtEmissao : existente.dtEmissao;
        const itensData = await this.montarItens(
          tx,
          empresaId,
          input.itens,
          fornecedorIdFinal,
          clienteIdFinal,
          dtEmissaoFinal,
        );
        itensUpdate = { itens: sincronizarFilhos(
          { campo: 'notaEntradaId', id: existente.id },
          itensData,
        ) };
      }

      const atualizada = await tx.notaEntrada.update({
        where: { id: existente.id },
        data: {
          ...(gravaFornecedor ? { fornecedorId } : {}),
          ...(gravaCliente ? { clienteId } : {}),
          ...(input.condicaoChave !== undefined
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
          ...(input.vlrSeguro !== undefined
            ? { vlrSeguro: input.vlrSeguro }
            : {}),
          ...(input.vlrDespesa !== undefined
            ? { vlrDespesa: input.vlrDespesa }
            : {}),
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
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.notaEntrada.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) return;
      await tx.notaEntrada.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
