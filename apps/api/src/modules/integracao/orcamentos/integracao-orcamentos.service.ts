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
  IntegracaoOrcamento,
  IntegracaoOrcamentoCreate,
  IntegracaoOrcamentoItem,
  IntegracaoOrcamentoQuery,
  IntegracaoOrcamentoUpdate,
  PaginationQuery,
} from '@plataforma/contracts';
import { calcularItensOrcamento } from '../../orcamentos/calcular-itens-orcamento';
import { criarAtividadeRetorno } from '../../orcamentos/criar-atividade-retorno';
import { proximoNumeroOrcamento } from '../../orcamentos/proximo-numero-orcamento';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';
import { sincronizarFilhos } from '../common/sincronizar-filhos';
import { ParametrosService } from '../../parametros/parametros.service';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

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
} satisfies Prisma.OrcamentoInclude;
type OrcamentoComRelacoes = Prisma.OrcamentoGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoOrcamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  private paraLeitura(row: OrcamentoComRelacoes): IntegracaoOrcamento {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      clienteCodigo: row.cliente.codigoErp ?? '',
      vendedorCodigo: row.vendedor.codigoErp ?? '',
      condicaoPagamentoCodigo: row.condicaoPagamento?.codigoErp ?? null,
      titulo: row.titulo,
      status: row.status,
      dataValidade: row.dataValidade,
      dataRetorno: row.dataRetorno,
      observacao: row.observacao,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        codigoErp: item.codigoErp ?? '',
        produtoCodigo: item.produto?.codigoErp ?? '',
        quantidade: item.quantidade,
        vlrUnitario: item.vlrUnitario,
        percComissao: item.percComissao,
        regraDescontoCodigo: item.regraDesconto?.codigoErp ?? null,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoOrcamentoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        codigoErp: { not: null },
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
      };
      const [data, total] = await Promise.all([
        tx.orcamento.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.orcamento.count({ where }),
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
  ): Promise<IntegracaoOrcamento> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.orcamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Orçamento não encontrado');
      return this.paraLeitura(row);
    });
  }

  /**
   * Orçamentos aprovados criados na plataforma (sem codigoErp ainda) —
   * prontos pro ERP importar. Depois de importar, o ERP chama vincular()
   * com o código gerado lá pra "reivindicar" o registro; a partir daí ele
   * passa a aparecer no findAll/findOne normais, como qualquer outro.
   */
  findAllPendentes(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        codigoErp: null,
        status: 'aprovado' as const,
        deletedAt: null,
      };
      const [data, total] = await Promise.all([
        tx.orcamento.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { createdAt: 'asc' },
        }),
        tx.orcamento.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  /**
   * Vincula um orçamento aprovado (criado na plataforma) ao codigoErp
   * gerado pelo ERP ao importá-lo. Só funciona uma vez — já vinculado, ainda
   * não aprovado, ou codigoErp colidindo com outro orçamento dão 409.
   */
  async vincular(
    empresaId: string,
    apiKeyId: string,
    id: string,
    codigoErp: string,
  ): Promise<IntegracaoOrcamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Orçamento não encontrado');
      if (existente.codigoErp != null) {
        throw new ConflictException(
          'Orçamento já está vinculado a um codigoErp',
        );
      }
      if (existente.status !== 'aprovado') {
        throw new ConflictException(
          'Só orçamentos aprovados podem ser vinculados',
        );
      }
      const duplicado = await tx.orcamento.findFirst({
        where: { empresaId, codigoErp },
      });
      if (duplicado) {
        throw new ConflictException(
          `Já existe orçamento com codigoErp ''`,
        );
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: { codigoErp, updatedBy: autor },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizado);
    });
  }

  private async resolverCliente(
    tx: TenantTx,
    empresaId: string,
    codigo: string,
  ) {
    const cliente = await tx.cliente.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!cliente)
      throw new NotFoundException(`clienteCodigo '${codigo}' não encontrado`);
    return cliente.id;
  }

  private async resolverVendedor(
    tx: TenantTx,
    empresaId: string,
    codigo: string,
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!vendedor)
      throw new NotFoundException(`vendedorCodigo '${codigo}' não encontrado`);
    return vendedor.id;
  }

  private async resolverCondicaoPagamento(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const condicao = await tx.condicaoPagamento.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!condicao)
      throw new NotFoundException(
        `condicaoPagamentoCodigo '${codigo}' não encontrado`,
      );
    return condicao.id;
  }

  private async montarItens(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    itens: IntegracaoOrcamentoItem[],
    vendedorId: string,
  ) {
    const itensParaCalculo = await Promise.all(
      itens.map(async (item) => {
        const produto = await tx.produto.findFirst({
          where: { empresaId, codigoErp: item.produtoCodigo, deletedAt: null },
          select: { id: true },
        });
        if (!produto)
          throw new NotFoundException(
            `itens[].produtoCodigo '${item.produtoCodigo}' não encontrado`,
          );
        return {
          codigoErp: item.codigoErp,
          produtoId: produto.id,
          quantidade: item.quantidade,
          vlrUnitario: item.vlrUnitario,
          percComissao: item.percComissao ?? null,
          regraDescontoId: await resolverRegraDesconto(
            tx,
            empresaId,
            item.regraDescontoCodigo,
          ),
        };
      }),
    );
    return calcularItensOrcamento(
      tx,
      empresaId,
      clienteId,
      itensParaCalculo,
      vendedorId,
      await this.parametros.obterBoolean(
        empresaId,
        'DESCONTO_ACIMA_LIMITE_BLOQUEIA',
        false,
      ),
    );
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoOrcamentoCreate,
  ): Promise<IntegracaoOrcamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const clienteId = await this.resolverCliente(
        tx,
        empresaId,
        input.clienteCodigo,
      );
      const vendedorId = await this.resolverVendedor(
        tx,
        empresaId,
        input.vendedorCodigo,
      );
      const condicaoPagamentoId = await this.resolverCondicaoPagamento(
        tx,
        empresaId,
        input.condicaoPagamentoCodigo,
      );
      const { data: itensData, vlrTotal } = await this.montarItens(
        tx,
        empresaId,
        clienteId,
        input.itens,
        vendedorId,
      );

      const dados = {
        codigoErp: input.codigoErp,
        clienteId,
        vendedorId,
        condicaoPagamentoId,
        titulo: input.titulo,
        status: input.status,
        dataValidade: input.dataValidade ?? null,
        dataRetorno: input.dataRetorno ?? null,
        observacao: input.observacao ?? null,
        vlrTotal,
        ativo: input.ativo,
        updatedBy: autor,
      };

      // No upsert o orçamento **mantém o número que já tinha**: numerar de
      // novo criaria uma segunda proposta com o mesmo codigoErp do ponto de
      // vista do ERP, e o cliente já viu o número antigo.
      const criado = decisao !== 'criar'
        ? await (async () => {
            return tx.orcamento.update({
              where: { id: existente!.id },
              data: {
                ...dados,
                ...camposDaDecisao(decisao),
                itens: sincronizarFilhos(empresaId, itensData),
              } as never,
              include: INCLUDE,
            });
          })()
        : await tx.orcamento.create({
            data: {
              ...dados,
              empresaId,
              numero: await proximoNumeroOrcamento(tx, empresaId),
              createdBy: autor,
              itens: { create: itensData },
            } as never,
            include: INCLUDE,
          });

      if (input.dataRetorno) {
        await criarAtividadeRetorno(tx, empresaId, autor, {
          orcamentoId: criado.id,
          titulo: input.titulo,
          clienteId,
          vendedorId,
          oportunidadeId: null,
          dataRetorno: input.dataRetorno,
        });
      }

      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoOrcamentoUpdate,
  ): Promise<IntegracaoOrcamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Orçamento não encontrado');
      if (existente.status === 'aprovado') {
        throw new ConflictException('Orçamento aprovado não pode ser alterado');
      }

      const clienteId =
        input.clienteCodigo !== undefined
          ? await this.resolverCliente(tx, empresaId, input.clienteCodigo)
          : undefined;
      const vendedorId =
        input.vendedorCodigo !== undefined
          ? await this.resolverVendedor(tx, empresaId, input.vendedorCodigo)
          : undefined;
      const condicaoPagamentoId =
        input.condicaoPagamentoCodigo !== undefined
          ? await this.resolverCondicaoPagamento(
              tx,
              empresaId,
              input.condicaoPagamentoCodigo,
            )
          : undefined;

      let itensUpdate: Record<string, unknown> = {};
      let vlrTotal: number | undefined;
      if (input.itens) {
        const clienteIdFinal = clienteId ?? existente.clienteId;
        const { data: itensData, vlrTotal: total } = await this.montarItens(
          tx,
          empresaId,
          clienteIdFinal,
          input.itens,
          vendedorId ?? existente.vendedorId,
        );
        itensUpdate = { itens: sincronizarFilhos(empresaId, itensData) };
        vlrTotal = total;
      }

      const dataRetorno =
        input.dataRetorno !== undefined ? input.dataRetorno : undefined;

      const atualizado = await tx.orcamento.update({
        where: { id: existente.id },
        data: {
          ...(clienteId !== undefined ? { clienteId } : {}),
          ...(vendedorId !== undefined ? { vendedorId } : {}),
          ...(condicaoPagamentoId !== undefined ? { condicaoPagamentoId } : {}),
          ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.dataValidade !== undefined
            ? { dataValidade: input.dataValidade }
            : {}),
          ...(dataRetorno !== undefined ? { dataRetorno } : {}),
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(vlrTotal !== undefined ? { vlrTotal } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
          ...itensUpdate,
        } as never,
        include: INCLUDE,
      });

      const dataRetornoMudou =
        dataRetorno !== undefined &&
        dataRetorno != null &&
        (!existente.dataRetorno ||
          dataRetorno.getTime() !== existente.dataRetorno.getTime());
      if (dataRetornoMudou) {
        await criarAtividadeRetorno(tx, empresaId, autor, {
          orcamentoId: existente.id,
          titulo: atualizado.titulo,
          clienteId: clienteId ?? existente.clienteId,
          vendedorId: vendedorId ?? existente.vendedorId,
          oportunidadeId: null,
          dataRetorno,
        });
      }

      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Orçamento não encontrado');
      await tx.orcamento.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
