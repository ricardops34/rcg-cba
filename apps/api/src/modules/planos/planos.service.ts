import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PlanoCreate, PlanoUpdate } from '@plataforma/contracts';

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlanos() {
    const planos = await this.prisma.plano.findMany({
      where: { deletedAt: null },
      orderBy: { valorMensal: 'asc' },
      include: {
        _count: {
          select: { assinaturas: true },
        },
        modulos: { select: { moduloId: true } },
        menus: { select: { menuId: true } },
        rotinas: { select: { rotinaId: true } },
      },
    });

    return planos.map((p) => ({
      ...p,
      valorMensal: Number(p.valorMensal),
      valorAnual: Number(p.valorAnual),
      moduloIds: p.modulos.map((m) => m.moduloId),
      menuIds: p.menus.map((m) => m.menuId),
      rotinaIds: p.rotinas.map((r) => r.rotinaId),
      totalEmpresas: p._count.assinaturas,
    }));
  }

  async getPlano(id: string) {
    const plano = await this.prisma.plano.findFirst({
      where: { id, deletedAt: null },
      include: {
        modulos: { select: { moduloId: true } },
        menus: { select: { menuId: true } },
        rotinas: { select: { rotinaId: true } },
      },
    });

    if (!plano) {
      throw new NotFoundException('Plano não encontrado');
    }

    return {
      ...plano,
      valorMensal: Number(plano.valorMensal),
      valorAnual: Number(plano.valorAnual),
      moduloIds: plano.modulos.map((m) => m.moduloId),
      menuIds: plano.menus.map((m) => m.menuId),
      rotinaIds: plano.rotinas.map((r) => r.rotinaId),
    };
  }

  async createPlano(input: PlanoCreate, actorId: string) {
    const existente = await this.prisma.plano.findFirst({
      where: { codigo: input.codigo, deletedAt: null },
    });
    if (existente) {
      throw new BadRequestException('Já existe um plano com este código.');
    }

    const { moduloIds, menuIds, rotinaIds, ...data } = input;

    return this.prisma.$transaction(async (tx) => {
      const plano = await tx.plano.create({
        data: {
          ...data,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      if (moduloIds && moduloIds.length > 0) {
        await tx.planoModulo.createMany({
          data: moduloIds.map((moduloId) => ({ planoId: plano.id, moduloId })),
        });
      }

      if (menuIds && menuIds.length > 0) {
        await tx.planoMenu.createMany({
          data: menuIds.map((menuId) => ({ planoId: plano.id, menuId })),
        });
      }

      if (rotinaIds && rotinaIds.length > 0) {
        await tx.planoRotina.createMany({
          data: rotinaIds.map((rotinaId) => ({ planoId: plano.id, rotinaId })),
        });
      }

      return plano;
    });
  }

  async updatePlano(id: string, input: PlanoUpdate, actorId: string) {
    await this.getPlano(id);

    const { moduloIds, menuIds, rotinaIds, ...data } = input;

    return this.prisma.$transaction(async (tx) => {
      const plano = await tx.plano.update({
        where: { id },
        data: {
          ...data,
          updatedBy: actorId,
        },
      });

      if (moduloIds !== undefined) {
        await tx.planoModulo.deleteMany({ where: { planoId: id } });
        if (moduloIds.length > 0) {
          await tx.planoModulo.createMany({
            data: moduloIds.map((moduloId) => ({ planoId: id, moduloId })),
          });
        }
      }

      if (menuIds !== undefined) {
        await tx.planoMenu.deleteMany({ where: { planoId: id } });
        if (menuIds.length > 0) {
          await tx.planoMenu.createMany({
            data: menuIds.map((menuId) => ({ planoId: id, menuId })),
          });
        }
      }

      if (rotinaIds !== undefined) {
        await tx.planoRotina.deleteMany({ where: { planoId: id } });
        if (rotinaIds.length > 0) {
          await tx.planoRotina.createMany({
            data: rotinaIds.map((rotinaId) => ({ planoId: id, rotinaId })),
          });
        }
      }

      return plano;
    });
  }

  async removePlano(id: string, actorId: string) {
    const assinaturasCount = await this.prisma.assinatura.count({
      where: { planoId: id },
    });
    if (assinaturasCount > 0) {
      throw new BadRequestException(
        `Este plano tem ${assinaturasCount} empresas assinantes. Mova-as de plano antes de excluir.`,
      );
    }

    await this.prisma.plano.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }
}
