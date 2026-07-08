import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  MenuCreate,
  MenuUpdate,
  ModuloCreate,
  ModuloUpdate,
  RotinaCreate,
  RotinaUpdate,
} from '@plataforma/contracts';

@Injectable()
export class EstruturaService {
  constructor(private readonly prisma: PrismaService) {}

  // Módulos --------------------------------------------------------
  listModulos(): Promise<unknown> {
    return this.prisma.modulo.findMany({
      where: { deletedAt: null },
      orderBy: { ordem: 'asc' },
      include: {
        menus: {
          where: { deletedAt: null },
          orderBy: { ordem: 'asc' },
          include: {
            rotinas: { where: { deletedAt: null }, select: { id: true, codigo: true, nome: true } },
          },
        },
      },
    });
  }

  async createModulo(input: ModuloCreate, actorId: string) {
    return this.prisma.modulo.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateModulo(id: string, input: ModuloUpdate, actorId: string) {
    await this.ensureExists('modulo', id);
    return this.prisma.modulo.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async removeModulo(id: string, actorId: string) {
    await this.ensureExists('modulo', id);
    await this.prisma.modulo.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  // Menus ------------------------------------------------------------
  listMenus(moduloId?: string): Promise<unknown> {
    return this.prisma.menu.findMany({
      where: { deletedAt: null, ...(moduloId ? { moduloId } : {}) },
      orderBy: { ordem: 'asc' },
      include: { rotinas: { where: { deletedAt: null } } },
    });
  }

  async createMenu(input: MenuCreate, actorId: string) {
    return this.prisma.menu.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateMenu(id: string, input: MenuUpdate, actorId: string) {
    await this.ensureExists('menu', id);
    return this.prisma.menu.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async removeMenu(id: string, actorId: string) {
    await this.ensureExists('menu', id);
    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  // Rotinas ------------------------------------------------------------
  listRotinas(menuId?: string): Promise<unknown> {
    return this.prisma.rotina.findMany({
      where: { deletedAt: null, ...(menuId ? { menuId } : {}) },
      orderBy: { nome: 'asc' },
    });
  }

  async createRotina(input: RotinaCreate, actorId: string) {
    return this.prisma.rotina.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateRotina(id: string, input: RotinaUpdate, actorId: string) {
    await this.ensureExists('rotina', id);
    return this.prisma.rotina.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async removeRotina(id: string, actorId: string) {
    await this.ensureExists('rotina', id);
    await this.prisma.rotina.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  private async ensureExists(
    entity: 'modulo' | 'menu' | 'rotina',
    id: string,
  ) {
    const record = await (this.prisma[entity] as any).findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) {
      throw new NotFoundException(
        `${entity.charAt(0).toUpperCase()}${entity.slice(1)} não encontrado`,
      );
    }
    return record;
  }
}
