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
  IntegracaoCategoria,
  IntegracaoCategoriaCreate,
  IntegracaoCategoriaQuery,
  IntegracaoCategoriaUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

const INCLUDE = {
  categoriaPai: { select: { codigoErp: true } },
  regraDesconto: { select: { codigoErp: true } },
} satisfies Prisma.CategoriaInclude;
type CategoriaComPai = Prisma.CategoriaGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoCategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: CategoriaComPai): IntegracaoCategoria {
    return {
      id: row.id,
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      categoriaPaiCodigo: row.categoriaPai?.codigoErp ?? null,
      regraDescontoCodigo: row.regraDesconto?.codigoErp ?? null,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoCategoriaQuery) {
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
        tx.categoria.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.categoria.count({ where }),
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
  ): Promise<IntegracaoCategoria> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.categoria.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Categoria não encontrada');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoCategoriaCreate,
  ): Promise<IntegracaoCategoria> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.categoria.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      const categoriaPaiId = await this.resolverCategoriaPai(
        tx,
        empresaId,
        input.categoriaPaiCodigo,
      );

      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoCodigo,
      );

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        categoriaPaiId,
        regraDescontoId: regraDescontoId ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.categoria.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return this.paraLeitura(atualizadoUpsert);
      }

      const criada = await tx.categoria.create({
        data: { ...dados, empresaId, createdBy: autor },
        include: INCLUDE,
      });
      return this.paraLeitura(criada);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoCategoriaUpdate,
  ): Promise<IntegracaoCategoria> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.categoria.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Categoria não encontrada');

      const categoriaPaiId =
        input.categoriaPaiCodigo !== undefined
          ? await this.resolverCategoriaPai(
              tx,
              empresaId,
              input.categoriaPaiCodigo,
            )
          : undefined;

      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoCodigo,
      );

      const atualizada = await tx.categoria.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(categoriaPaiId !== undefined ? { categoriaPaiId } : {}),
          ...(regraDescontoId !== undefined ? { regraDescontoId } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
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
      const existente = await tx.categoria.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Categoria não encontrada');
      await tx.categoria.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCategoriaPai(
    tx: TenantTx,
    empresaId: string,
    categoriaPaiCodigo: string | null | undefined,
  ) {
    if (!categoriaPaiCodigo) return null;
    const pai = await tx.categoria.findFirst({
      where: { empresaId, codigoErp: categoriaPaiCodigo, deletedAt: null },
      select: { id: true },
    });
    if (!pai)
      throw new NotFoundException(
        `categoriaPaiCodigo '${categoriaPaiCodigo}' não encontrado`,
      );
    return pai.id;
  }
}
