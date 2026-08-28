import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoCondicaoPagamento,
  IntegracaoCondicaoPagamentoCreate,
  IntegracaoCondicaoPagamentoQuery,
  IntegracaoCondicaoPagamentoUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';

@Injectable()
export class IntegracaoCondicoesPagamentoService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: {
    id: string;
    codigoErp: string;
    descricao: string;
    forma: string | null;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
    updatedBy: string | null;
  }): IntegracaoCondicaoPagamento {
    return {
      id: row.id,
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      forma: row.forma,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoCondicaoPagamentoQuery) {
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
        tx.condicaoPagamento.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.condicaoPagamento.count({ where }),
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
  ): Promise<IntegracaoCondicaoPagamento> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.condicaoPagamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!row)
        throw new NotFoundException('Condição de pagamento não encontrada');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoCondicaoPagamentoCreate,
  ): Promise<IntegracaoCondicaoPagamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.condicaoPagamento.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        forma: input.forma ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.condicaoPagamento.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
        });
        return this.paraLeitura(atualizadoUpsert);
      }

      const criada = await tx.condicaoPagamento.create({
        data: { ...dados, empresaId, createdBy: autor },
      });
      return this.paraLeitura(criada);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoCondicaoPagamentoUpdate,
  ): Promise<IntegracaoCondicaoPagamento> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.condicaoPagamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Condição de pagamento não encontrada');

      const atualizada = await tx.condicaoPagamento.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.forma !== undefined ? { forma: input.forma } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
        },
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
      const existente = await tx.condicaoPagamento.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Condição de pagamento não encontrada');
      await tx.condicaoPagamento.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
