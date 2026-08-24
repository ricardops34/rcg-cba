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
  IntegracaoProduto,
  IntegracaoProdutoCreate,
  IntegracaoProdutoQuery,
  IntegracaoProdutoUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  deveReativar,
  LIMPAR_EXCLUSAO,
} from '../common/reativar-excluido';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

const INCLUDE = {
  categoria: { select: { codigoErp: true } },
  subCategoria: { select: { codigoErp: true } },
  armazem: { select: { codigoErp: true } },
  regraDesconto: { select: { codigoErp: true } },
} satisfies Prisma.ProdutoInclude;
type ProdutoComRelacoes = Prisma.ProdutoGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: ProdutoComRelacoes): IntegracaoProduto {
    return {
      id: row.id,
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      unidade: row.unidade,
      categoriaCodigo: row.categoria?.codigoErp ?? null,
      subCategoriaCodigo: row.subCategoria?.codigoErp ?? null,
      armazemCodigo: row.armazem?.codigoErp ?? null,
      marca: row.marca,
      codigoBarras: row.codigoBarras,
      ncm: row.ncm,
      qtdEmbalagem: row.qtdEmbalagem,
      peso: row.peso,
      ultimoPreco: row.ultimoPreco,
      observacao: row.observacao,
      regraDescontoCodigo: row.regraDesconto?.codigoErp ?? null,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoProdutoQuery) {
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
        tx.produto.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.produto.count({ where }),
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
  ): Promise<IntegracaoProduto> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.produto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Produto não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoProdutoCreate,
  ): Promise<IntegracaoProduto> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.produto.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const reativar = deveReativar(
        existente,
        `Já existe produto com codigoErp '${input.codigoErp}'`,
      );

      const categoriaId = await this.resolverCategoria(
        tx,
        empresaId,
        input.categoriaCodigo,
        'categoriaCodigo',
      );
      const subCategoriaId = await this.resolverCategoria(
        tx,
        empresaId,
        input.subCategoriaCodigo,
        'subCategoriaCodigo',
      );
      const armazemId = await this.resolverArmazem(
        tx,
        empresaId,
        input.armazemCodigo,
      );
      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoCodigo,
      );

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        unidade: input.unidade ?? null,
        categoriaId,
        subCategoriaId,
        armazemId,
        marca: input.marca ?? null,
        codigoBarras: input.codigoBarras ?? null,
        ncm: input.ncm ?? null,
        qtdEmbalagem: input.qtdEmbalagem ?? null,
        peso: input.peso ?? null,
        ultimoPreco: input.ultimoPreco ?? null,
        observacao: input.observacao ?? null,
        regraDescontoId: regraDescontoId ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (reativar) {
        const reativado = await tx.produto.update({
          where: { id: existente!.id },
          data: { ...dados, ...LIMPAR_EXCLUSAO },
          include: INCLUDE,
        });
        return this.paraLeitura(reativado);
      }

      const criado = await tx.produto.create({
        data: { ...dados, empresaId, createdBy: autor },
        include: INCLUDE,
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoProdutoUpdate,
  ): Promise<IntegracaoProduto> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.produto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Produto não encontrado');

      const categoriaId =
        input.categoriaCodigo !== undefined
          ? await this.resolverCategoria(
              tx,
              empresaId,
              input.categoriaCodigo,
              'categoriaCodigo',
            )
          : undefined;
      const subCategoriaId =
        input.subCategoriaCodigo !== undefined
          ? await this.resolverCategoria(
              tx,
              empresaId,
              input.subCategoriaCodigo,
              'subCategoriaCodigo',
            )
          : undefined;
      const armazemId =
        input.armazemCodigo !== undefined
          ? await this.resolverArmazem(tx, empresaId, input.armazemCodigo)
          : undefined;
      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoCodigo,
      );

      const atualizado = await tx.produto.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.unidade !== undefined ? { unidade: input.unidade } : {}),
          ...(categoriaId !== undefined ? { categoriaId } : {}),
          ...(subCategoriaId !== undefined ? { subCategoriaId } : {}),
          ...(armazemId !== undefined ? { armazemId } : {}),
          ...(regraDescontoId !== undefined ? { regraDescontoId } : {}),
          ...(input.marca !== undefined ? { marca: input.marca } : {}),
          ...(input.codigoBarras !== undefined
            ? { codigoBarras: input.codigoBarras }
            : {}),
          ...(input.ncm !== undefined ? { ncm: input.ncm } : {}),
          ...(input.qtdEmbalagem !== undefined
            ? { qtdEmbalagem: input.qtdEmbalagem }
            : {}),
          ...(input.peso !== undefined ? { peso: input.peso } : {}),
          ...(input.ultimoPreco !== undefined
            ? { ultimoPreco: input.ultimoPreco }
            : {}),
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
        },
        include: INCLUDE,
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
      const existente = await tx.produto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Produto não encontrado');
      await tx.produto.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCategoria(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
    campo: string,
  ) {
    if (!codigo) return null;
    const categoria = await tx.categoria.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!categoria)
      throw new NotFoundException(`${campo} '${codigo}' não encontrado`);
    return categoria.id;
  }

  private async resolverArmazem(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const armazem = await tx.armazem.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!armazem)
      throw new NotFoundException(`armazemCodigo '${codigo}' não encontrado`);
    return armazem.id;
  }
}
