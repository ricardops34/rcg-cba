import { existsSync, unlink } from 'node:fs';
import { basename, join } from 'node:path';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPaginatedResult, paginationToSkipTake } from '../../common/pagination/paginate';
import { LOGOS_DIR, logoPublicPath } from '../../common/uploads/uploads.config';
import type { EmpresaCreate, EmpresaQuery, EmpresaUpdate } from '@plataforma/contracts';

const SORT_FIELDS = new Set(['razaoSocial', 'nomeFantasia', 'cnpj', 'ativo', 'createdAt']);

@Injectable()
export class EmpresasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: EmpresaQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { razaoSocial: { contains: query.search, mode: 'insensitive' as const } },
              { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } },
              { cnpj: { contains: query.search } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'razaoSocial';

    const [data, total] = await Promise.all([
      this.prisma.empresa.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.empresa.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id, deletedAt: null },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    return empresa;
  }

  async create(input: EmpresaCreate, userId: string) {
    const existente = await this.prisma.empresa.findUnique({
      where: { cnpj: input.cnpj },
    });
    if (existente) throw new ConflictException('CNPJ já cadastrado');

    if (input.alias) await this.ensureAliasDisponivel(input.alias);

    return this.prisma.empresa.create({
      data: { ...input, createdBy: userId, updatedBy: userId },
    });
  }

  async update(id: string, input: EmpresaUpdate, userId: string) {
    await this.findOne(id);
    if (input.alias) await this.ensureAliasDisponivel(input.alias, id);
    return this.prisma.empresa.update({
      where: { id },
      data: { ...input, updatedBy: userId },
    });
  }

  /** Garante que o alias não está em uso por outra empresa. */
  private async ensureAliasDisponivel(alias: string, ignorarId?: string) {
    const emUso = await this.prisma.empresa.findFirst({
      where: {
        alias,
        deletedAt: null,
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { id: true },
    });
    if (emUso) throw new ConflictException('Alias já em uso por outra empresa');
  }

  /** Define o logo da empresa a partir do arquivo já gravado em disco. */
  async setLogo(id: string, filename: string, userId: string) {
    const empresa = await this.findOne(id);

    // Remove o logo anterior (best-effort) para não acumular órfãos em disco.
    if (empresa.logoUrl) {
      const anterior = join(LOGOS_DIR, basename(empresa.logoUrl));
      if (existsSync(anterior)) unlink(anterior, () => undefined);
    }

    return this.prisma.empresa.update({
      where: { id },
      data: { logoUrl: logoPublicPath(filename), updatedBy: userId },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.empresa.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, ativo: false },
    });
    return { success: true };
  }
}
