import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoTabelaPreco,
  IntegracaoTabelaPrecoCreate,
  IntegracaoTabelaPrecoQuery,
  IntegracaoTabelaPrecoUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';
import { sincronizarFilhos } from '../common/sincronizar-filhos';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

const INCLUDE = {
  itens: {
    where: { deletedAt: null },
    include: {
      produto: { select: { codigoErp: true } },
      regraDesconto: { select: { codigoErp: true } },
    },
  },
} satisfies Prisma.TabelaPrecoInclude;
type TabelaComItens = Prisma.TabelaPrecoGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoTabelasPrecoService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: TabelaComItens): IntegracaoTabelaPreco {
    return {
      id: row.id,
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      dtInicio: row.dtInicio,
      dtFim: row.dtFim,
      ativo: row.ativo,
      itens: row.itens.map((item) => ({
        codigoErp: item.codigoErp ?? '',
        produtoCodigo: item.produto.codigoErp,
        preco: item.preco,
        regraDescontoCodigo: item.regraDesconto?.codigoErp ?? null,
        ativo: item.ativo,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoTabelaPrecoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              descricao: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.tabelaPreco.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.tabelaPreco.count({ where }),
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
  ): Promise<IntegracaoTabelaPreco> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.tabelaPreco.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Tabela de preço não encontrada');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoTabelaPrecoCreate,
  ): Promise<IntegracaoTabelaPreco> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tabelaPreco.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const itensData = await Promise.all(
        input.itens.map(async (item) => {
          const produto = await tx.produto.findFirst({
            where: {
              empresaId,
              codigoErp: item.produtoCodigo,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!produto)
            throw new NotFoundException(
              `produtoCodigo '${item.produtoCodigo}' não encontrado`,
            );
          return {
            empresaId,
            codigoErp: item.codigoErp,
            produtoId: produto.id,
            preco: item.preco,
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

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        dtInicio: input.dtInicio ?? null,
        dtFim: input.dtFim ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        // O ERP manda a tabela inteira: linha que não veio mais não existe
        // mais, e a que veio é casada pelo codigoErp.
        const atualizadoUpsert = await tx.tabelaPreco.update({
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

      const criada = await tx.tabelaPreco.create({
        data: {
          ...dados,
          empresaId,
          createdBy: autor,
          itens: { create: itensData },
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
    input: IntegracaoTabelaPrecoUpdate,
  ): Promise<IntegracaoTabelaPreco> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tabelaPreco.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Tabela de preço não encontrada');

      let itensUpdate: Record<string, unknown> = {};
      if (input.itens) {
        const itensData = await Promise.all(
          input.itens.map(async (item) => {
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
                `produtoCodigo '${item.produtoCodigo}' não encontrado`,
              );
            }
            return {
              empresaId,
              codigoErp: item.codigoErp,
              produtoId: produto.id,
              preco: item.preco,
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
        itensUpdate = { itens: sincronizarFilhos(empresaId, itensData) };
      }

      const atualizada = await tx.tabelaPreco.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.dtInicio !== undefined ? { dtInicio: input.dtInicio } : {}),
          ...(input.dtFim !== undefined ? { dtFim: input.dtFim } : {}),
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
      const existente = await tx.tabelaPreco.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Tabela de preço não encontrada');
      await tx.tabelaPreco.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
