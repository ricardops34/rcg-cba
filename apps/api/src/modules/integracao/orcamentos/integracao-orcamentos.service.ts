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
  IntegracaoOrcamentoVincular,
  PaginationQuery,
  IntegracaoOrcamentoLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { calcularItensOrcamento } from '../../orcamentos/calcular-itens-orcamento';
import { criarAtividadeRetorno } from '../../orcamentos/criar-atividade-retorno';
import { proximoNumeroOrcamento } from '../../orcamentos/proximo-numero-orcamento';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import { criarFilhos, sincronizarFilhos } from '../common/sincronizar-filhos';
import { ParametrosService } from '../../parametros/parametros.service';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

const INCLUDE = {
  cliente: { select: { chave: true } },
  vendedor: { select: { chave: true } },
  condicaoPagamento: { select: { chave: true } },
  itens: {
    include: {
      produto: { select: { chave: true } },
      regraDesconto: { select: { chave: true } },
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
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      clienteChave: row.cliente.chave ?? '',
      vendedorChave: row.vendedor.chave ?? '',
      condicaoPagamentoChave: row.condicaoPagamento?.chave ?? null,
      titulo: row.titulo,
      status: row.status,
      dataValidade: row.dataValidade,
      dataRetorno: row.dataRetorno,
      observacao: row.observacao,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        id: item.id,
        delete: false,
        chave: item.chave ?? '',
        produtoChave: item.produto?.chave ?? '',
        quantidade: item.quantidade,
        vlrUnitario: item.vlrUnitario,
        percComissao: item.percComissao,
        regraDescontoChave: item.regraDesconto?.chave ?? null,
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
        chave: { not: null },
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
      };
      const [data, total] = await Promise.all([
        tx.orcamento.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { chave: 'asc' },
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
    chave: string,
  ): Promise<IntegracaoOrcamento> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.orcamento.findFirst({
        where: { empresaId, chave, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Orçamento não encontrado');
      return this.paraLeitura(row);
    });
  }

  /**
   * Orçamentos aprovados criados na plataforma (sem chave ainda) —
   * prontos pro ERP importar. Depois de importar, o ERP chama vincular()
   * com o código gerado lá pra "reivindicar" o registro; a partir daí ele
   * passa a aparecer no findAll/findOne normais, como qualquer outro.
   */
  findAllPendentes(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        chave: null,
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
   * Vincula um orçamento aprovado (criado na plataforma) ao pedido que o ERP
   * gerou a partir dele. Pedido e itens vêm juntos: a chave do SC5 vai para o
   * orçamento, e a de cada SC6 para o item do orçamento de mesmo id. Só
   * funciona uma vez — já vinculado, ainda não aprovado, chave colidindo com
   * outro orçamento ou item que não é deste orçamento dão 409.
   */
  async vincular(
    empresaId: string,
    apiKeyId: string,
    id: string,
    dto: IntegracaoOrcamentoVincular,
  ): Promise<IntegracaoOrcamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: { itens: { select: { id: true } } },
      });
      if (!existente) throw new NotFoundException('Orçamento não encontrado');
      if (existente.chave != null) {
        throw new ConflictException('Orçamento já está vinculado a um pedido');
      }
      if (existente.status !== 'aprovado') {
        throw new ConflictException(
          'Só orçamentos aprovados podem ser vinculados',
        );
      }
      const duplicado = await tx.orcamento.findFirst({
        where: { empresaId, chave: dto.chave },
      });
      if (duplicado) {
        throw new ConflictException(
          `Já existe orçamento com a chave '${dto.chave}'`,
        );
      }
      const doOrcamento = new Set(existente.itens.map((item) => item.id));
      const alheio = dto.itens.find((item) => !doOrcamento.has(item.id));
      if (alheio) {
        throw new ConflictException(
          `Item '${alheio.id}' não pertence a este orçamento`,
        );
      }

      for (const item of dto.itens) {
        await tx.orcamentoItem.update({
          where: { id: item.id },
          data: { chave: item.chave },
        });
      }
      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          chave: dto.chave,
          codigoErp: dto.codigoErp ?? null,
          updatedBy: autor,
        },
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
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!cliente)
      throw new NotFoundException(`clienteChave '${codigo}' não encontrado`);
    return cliente.id;
  }

  private async resolverVendedor(
    tx: TenantTx,
    empresaId: string,
    codigo: string,
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!vendedor)
      throw new NotFoundException(`vendedorChave '${codigo}' não encontrado`);
    return vendedor.id;
  }

  private async resolverCondicaoPagamento(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const condicao = await tx.condicaoPagamento.findFirst({
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!condicao)
      throw new NotFoundException(
        `condicaoPagamentoChave '${codigo}' não encontrado`,
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
    const itensExcluidos = itens.filter((item) => item.delete);
    const itensParaCalculo = await Promise.all(
      itens.filter((item) => !item.delete).map(async (item) => {
        const produto = await tx.produto.findFirst({
          where: { empresaId, chave: item.produtoChave, deletedAt: null },
          select: { id: true },
        });
        if (!produto)
          throw new NotFoundException(
            `itens[].produtoChave '${item.produtoChave}' não encontrado`,
          );
        return {
          chave: item.chave,
          produtoId: produto.id,
          quantidade: item.quantidade,
          vlrUnitario: item.vlrUnitario,
          percComissao: item.percComissao ?? null,
          regraDescontoId: await resolverRegraDesconto(
            tx,
            empresaId,
            item.regraDescontoChave,
          ),
        };
      }),
    );
    const calculados = await calcularItensOrcamento(
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
    return {
      ...calculados,
      data: [
        ...calculados.data,
        ...itensExcluidos.map((item) => ({
          empresaId,
          chave: item.chave,
          delete: true,
        })),
      ],
    };
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoOrcamentoCreate,
  ): Promise<IntegracaoOrcamento> {
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu**.
   *
   * Só o lote precisa dessa informação — é o que separa `criados` de
   * `atualizados` no relatório. O `create` continua devolvendo apenas o
   * registro, porque o REST individual responde a entidade e a decisão não
   * cabe no corpo dela.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoOrcamentoCreate,
  ): Promise<{ registro: IntegracaoOrcamento; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const clienteId = await this.resolverCliente(
        tx,
        empresaId,
        input.clienteChave,
      );
      const vendedorId = await this.resolverVendedor(
        tx,
        empresaId,
        input.vendedorChave,
      );
      const condicaoPagamentoId = await this.resolverCondicaoPagamento(
        tx,
        empresaId,
        input.condicaoPagamentoChave,
      );
      const { data: itensData, vlrTotal } = await this.montarItens(
        tx,
        empresaId,
        clienteId,
        input.itens,
        vendedorId,
      );

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? null,
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
      // novo criaria uma segunda proposta com o mesma chave do ponto de
      // vista do ERP, e o cliente já viu o número antigo.
      const criado = decisao !== 'criar'
        ? await (async () => {
            return tx.orcamento.update({
              where: { id: existente!.id },
              data: {
                ...dados,
                ...camposDaDecisao(decisao),
                itens: sincronizarFilhos(
              { campo: 'orcamentoId', id: existente!.id },
              itensData,
            ),
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
              itens: { create: criarFilhos(itensData) },
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

      return { registro: this.paraLeitura(criado), decisao };
    });
  }

  /**
   * Aplica um lote. Ver `processarLote` para a ordem e o tratamento de erro;
   * aqui fica só o que é da entidade.
   *
   * A reativação conta como `atualizado`: a linha já existia e mantém o mesmo
   * uuid — quem lê o relatório está conferindo quantos registros novos
   * entraram, e um código que volta do soft delete não é um deles.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoOrcamentoLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoOrcamentoCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoOrcamentoUpdate,
  ): Promise<IntegracaoOrcamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Orçamento não encontrado');
      if (existente.status === 'aprovado') {
        throw new ConflictException('Orçamento aprovado não pode ser alterado');
      }

      const clienteId =
        input.clienteChave !== undefined
          ? await this.resolverCliente(tx, empresaId, input.clienteChave)
          : undefined;
      const vendedorId =
        input.vendedorChave !== undefined
          ? await this.resolverVendedor(tx, empresaId, input.vendedorChave)
          : undefined;
      const condicaoPagamentoId =
        input.condicaoPagamentoChave !== undefined
          ? await this.resolverCondicaoPagamento(
              tx,
              empresaId,
              input.condicaoPagamentoChave,
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
        itensUpdate = { itens: sincronizarFilhos(
          { campo: 'orcamentoId', id: existente.id },
          itensData,
        ) };
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
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.orcamento.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) return;
      await tx.orcamento.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
