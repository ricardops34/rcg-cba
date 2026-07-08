import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPaginatedResult, paginationToSkipTake } from '../../common/pagination/paginate';
import type { EmpresaCreate, EmpresaUpdate } from '@plataforma/contracts';
import type { PaginationQuery } from '@plataforma/contracts';

@Injectable()
export class EmpresasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQuery) {
    const where = {
      deletedAt: null,
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

    const [data, total] = await Promise.all([
      this.prisma.empresa.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [query.sortBy ?? 'razaoSocial']: query.sortOrder },
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

    return this.prisma.empresa.create({
      data: { ...input, createdBy: userId, updatedBy: userId },
    });
  }

  async update(id: string, input: EmpresaUpdate, userId: string) {
    await this.findOne(id);
    return this.prisma.empresa.update({
      where: { id },
      data: { ...input, updatedBy: userId },
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
