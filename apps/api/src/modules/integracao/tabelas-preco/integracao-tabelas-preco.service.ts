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
  deveReativar,
  LIMPAR_EXCLUSAO,
} from '../common/reativar-excluido';
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
      const reativar = deveReativar(
        existente,
        `Já existe tabela de preço com codigoErp '${input.codigoErp}'`,
      );

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

      if (reativar) {
        // Os itens do payload substituem os da tabela excluída — mesma regra
        // do `update`.
        await tx.tabelaPrecoItem.deleteMany({
          where: { tabelaPrecoId: existente!.id },
        });
        const reativada = await tx.tabelaPreco.update({
          where: { id: existente!.id },
          data: { ...dados, ...LIMPAR_EXCLUSAO, itens: { create: itensData } },
          include: INCLUDE,
        });
        return this.paraLeitura(reativada);
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
        await tx.tabelaPrecoItem.deleteMany({
          where: { tabelaPrecoId: existente.id },
        });
        itensUpdate = { itens: { create: itensData } };
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
