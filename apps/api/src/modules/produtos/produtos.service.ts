import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ProdutoCreate,
  ProdutoQuery,
  ProdutoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { basename, join } from 'node:path';
import { existsSync, unlink } from 'node:fs';
import {
  PRODUTOS_DIR,
  produtoFotoPublicPath,
} from '../../common/uploads/uploads.config';

const SORT_FIELDS = new Set([
  'descricao',
  'codigoErp',
  'marca',
  'ultimoPreco',
  'ativo',
]);

// Cadastros auxiliares anexados às respostas (colunas da listagem/form).
const CATEGORIA_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};
const ARMAZEM_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};
// Regra de desconto vinculada (SZ0): acompanha a leitura pra tela exibir sem
// um segundo fetch.
const REGRA_DESCONTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};
const PRODUTO_INCLUDE = {
  categoria: CATEGORIA_SELECT,
  subCategoria: CATEGORIA_SELECT,
  armazem: ARMAZEM_SELECT,
  regraDesconto: REGRA_DESCONTO_SELECT,
  fotos: {
    orderBy: [{ principal: 'desc' as const }, { ordem: 'asc' as const }],
  },
};

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, query: ProdutoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
        ...(query.regraDescontoId
          ? { regraDescontoId: query.regraDescontoId }
          : {}),
        ...(query.subCategoriaId
          ? { subCategoriaId: query.subCategoriaId }
          : {}),
        ...(query.armazemId ? { armazemId: query.armazemId } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  descricao: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  codigoErp: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  marca: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  categoria: {
                    descricao: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                {
                  codigoBarras: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'descricao';
      const [data, total] = await Promise.all([
        tx.produto.findMany({
          where,
          include: PRODUTO_INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.produto.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: PRODUTO_INCLUDE,
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return produto;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ProdutoCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      return tx.produto.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
        include: PRODUTO_INCLUDE,
      });
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ProdutoUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return tx.produto.update({
        where: { id },
        data: {
          ...(this.limpar(input) as object),
          updatedBy: user.id,
        } as never,
        include: PRODUTO_INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return tx.produto.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  async setFoto(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    filename: string,
    originalname: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!produto) {
        unlink(join(PRODUTOS_DIR, filename), () => undefined);
        throw new NotFoundException('Produto não encontrado');
      }
      const ultima = await tx.produtoFoto.findFirst({
        where: { produtoId: id, empresaId },
        orderBy: { ordem: 'desc' },
      });
      await tx.produtoFoto.create({
        data: {
          empresaId,
          produtoId: id,
          url: produtoFotoPublicPath(filename),
          nomeArquivo: basename(originalname.replaceAll('\\', '/')).slice(
            0,
            255,
          ),
          principal: !ultima,
          ordem: (ultima?.ordem ?? -1) + 1,
          createdBy: user.id,
        },
      });
      return tx.produto.findUniqueOrThrow({
        where: { id },
        include: PRODUTO_INCLUDE,
      });
    });
  }

  async definirFotoPrincipal(
    empresaId: string,
    user: AuthenticatedUser,
    produtoId: string,
    fotoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const foto = await tx.produtoFoto.findFirst({
        where: { id: fotoId, produtoId, empresaId },
      });
      if (!foto) throw new NotFoundException('Foto não encontrada');
      await tx.produtoFoto.updateMany({
        where: { produtoId, empresaId, principal: true },
        data: { principal: false },
      });
      await tx.produtoFoto.update({
        where: { id: fotoId },
        data: { principal: true },
      });
      return tx.produto.update({
        where: { id: produtoId },
        data: { updatedBy: user.id },
        include: PRODUTO_INCLUDE,
      });
    });
  }

  async removerFoto(
    empresaId: string,
    user: AuthenticatedUser,
    produtoId: string,
    fotoId: string,
  ) {
    const removida = await this.prisma.withTenant(empresaId, async (tx) => {
      const foto = await tx.produtoFoto.findFirst({
        where: { id: fotoId, produtoId, empresaId },
      });
      if (!foto) throw new NotFoundException('Foto não encontrada');
      await tx.produtoFoto.delete({ where: { id: fotoId } });
      if (foto.principal) {
        const proxima = await tx.produtoFoto.findFirst({
          where: { produtoId, empresaId },
          orderBy: { ordem: 'asc' },
        });
        if (proxima) {
          await tx.produtoFoto.update({
            where: { id: proxima.id },
            data: { principal: true },
          });
        }
      }
      const produto = await tx.produto.update({
        where: { id: produtoId },
        data: { updatedBy: user.id },
        include: PRODUTO_INCLUDE,
      });
      return { produto, url: foto.url };
    });
    const arquivo = join(PRODUTOS_DIR, basename(removida.url));
    if (existsSync(arquivo)) unlink(arquivo, () => undefined);
    return removida.produto;
  }
}
