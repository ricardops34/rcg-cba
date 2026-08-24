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
  IntegracaoArmazem,
  IntegracaoArmazemCreate,
  IntegracaoArmazemQuery,
  IntegracaoArmazemUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  deveReativar,
  LIMPAR_EXCLUSAO,
} from '../common/reativar-excluido';

@Injectable()
export class IntegracaoArmazensService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: {
    id: string;
    codigoErp: string;
    descricao: string;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
    updatedBy: string | null;
  }): IntegracaoArmazem {
    return {
      id: row.id,
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoArmazemQuery) {
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
        tx.armazem.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.armazem.count({ where }),
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
  ): Promise<IntegracaoArmazem> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.armazem.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!row) throw new NotFoundException('Armazém não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoArmazemCreate,
  ): Promise<IntegracaoArmazem> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.armazem.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const reativar = deveReativar(
        existente,
        `Já existe armazém com codigoErp '${input.codigoErp}'`,
      );

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (reativar) {
        const reativado = await tx.armazem.update({
          where: { id: existente!.id },
          data: { ...dados, ...LIMPAR_EXCLUSAO },
        });
        return this.paraLeitura(reativado);
      }

      const criado = await tx.armazem.create({
        data: { ...dados, empresaId, createdBy: autor },
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoArmazemUpdate,
  ): Promise<IntegracaoArmazem> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.armazem.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Armazém não encontrado');

      const atualizado = await tx.armazem.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
        },
      });
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
      const existente = await tx.armazem.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Armazém não encontrado');
      await tx.armazem.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
