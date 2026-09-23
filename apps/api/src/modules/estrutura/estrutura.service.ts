import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  MenuCreate,
  MenuUpdate,
  ModuloCreate,
  ModuloUpdate,
  RotinaCreate,
  RotinaUpdate,
} from '@plataforma/contracts';

const ROTINA_SELECT = {
  id: true,
  codigo: true,
  nome: true,
  ativo: true,
  disponivelTelaPequena: true,
} as const;

@Injectable()
export class EstruturaService {
  constructor(private readonly prisma: PrismaService) {}

  // Módulos --------------------------------------------------------
  async listModulos(empresaId: string) {
    const desativados = await this.desativadosDaEmpresa(empresaId);

    const modulos = await this.prisma.modulo.findMany({
      where: { deletedAt: null, ativo: true },
      orderBy: { ordem: 'asc' },
      include: {
        menus: {
          where: { deletedAt: null, ativo: true, menuPaiId: null },
          orderBy: { ordem: 'asc' },
          include: {
            rotinas: {
              where: { deletedAt: null, ativo: true },
              select: ROTINA_SELECT,
            },
            submenus: {
              where: { deletedAt: null, ativo: true },
              orderBy: { ordem: 'asc' },
              include: {
                rotinas: {
                  where: { deletedAt: null, ativo: true },
                  select: ROTINA_SELECT,
                },
              },
            },
          },
        },
      },
    });

    return modulos
      .filter((modulo) => !desativados.modulos.has(modulo.id))
      .map((modulo) => ({
        ...modulo,
        menus: modulo.menus
          .filter((menu) => !desativados.menus.has(menu.id))
          .map((menu) => ({
            ...menu,
            rotinas: menu.rotinas.filter(
              (rotina) => !desativados.rotinas.has(rotina.id),
            ),
            submenus: menu.submenus
              .filter((sub) => !desativados.menus.has(sub.id))
              .map((sub) => ({
                ...sub,
                rotinas: sub.rotinas.filter(
                  (rotina) => !desativados.rotinas.has(rotina.id),
                ),
              })),
          })),
      }));
  }

  private async desativadosDaEmpresa(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [modulos, menus, rotinas, assinatura] = await Promise.all([
        tx.empresaModulo.findMany({ where: { empresaId, ativo: false } }),
        tx.empresaMenu.findMany({ where: { empresaId, ativo: false } }),
        tx.empresaRotina.findMany({ where: { empresaId, ativo: false } }),
        tx.assinatura.findFirst({
          where: { empresaId },
          include: {
            plano: {
              include: {
                modulos: true,
                menus: true,
                rotinas: true,
              },
            },
          },
        }),
      ]);

      const disabledModulos = new Set(modulos.map((m) => m.moduloId));
      const disabledMenus = new Set(menus.map((m) => m.menuId));
      const disabledRotinas = new Set(rotinas.map((r) => r.rotinaId));

      if (assinatura?.plano) {
        const planoModulos = new Set(
          assinatura.plano.modulos.map((m) => m.moduloId),
        );
        const planoMenus = new Set(
          assinatura.plano.menus.map((m) => m.menuId),
        );
        const planoRotinas = new Set(
          assinatura.plano.rotinas.map((r) => r.rotinaId),
        );

        if (planoModulos.size > 0) {
          const allModulos = await tx.modulo.findMany({ select: { id: true } });
          allModulos.forEach((m) => {
            if (!planoModulos.has(m.id)) disabledModulos.add(m.id);
          });
        }

        if (planoMenus.size > 0) {
          const allMenus = await tx.menu.findMany({ select: { id: true } });
          allMenus.forEach((m) => {
            if (!planoMenus.has(m.id)) disabledMenus.add(m.id);
          });
        }

        if (planoRotinas.size > 0) {
          const allRotinas = await tx.rotina.findMany({ select: { id: true } });
          allRotinas.forEach((r) => {
            if (!planoRotinas.has(r.id)) disabledRotinas.add(r.id);
          });
        }
      }

      return {
        modulos: disabledModulos,
        menus: disabledMenus,
        rotinas: disabledRotinas,
      };
    });
  }

  async definirModuloDaEmpresa(
    empresaId: string,
    moduloId: string,
    ativo: boolean,
    actorId: string,
  ) {
    await this.ensureExists('modulo', moduloId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaModulo.upsert({
        where: { empresaId_moduloId: { empresaId, moduloId } },
        create: {
          empresaId,
          moduloId,
          ativo,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: { ativo, updatedBy: actorId },
      }),
    );
  }

  async definirMenuDaEmpresa(
    empresaId: string,
    menuId: string,
    ativo: boolean,
    actorId: string,
  ) {
    await this.ensureMenu(menuId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaMenu.upsert({
        where: { empresaId_menuId: { empresaId, menuId } },
        create: {
          empresaId,
          menuId,
          ativo,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: { ativo, updatedBy: actorId },
      }),
    );
  }

  async definirRotinaDaEmpresa(
    empresaId: string,
    rotinaId: string,
    ativo: boolean,
    actorId: string,
  ) {
    await this.ensureExists('rotina', rotinaId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaRotina.upsert({
        where: { empresaId_rotinaId: { empresaId, rotinaId } },
        create: {
          empresaId,
          rotinaId,
          ativo,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: { ativo, updatedBy: actorId },
      }),
    );
  }

  async listArvore(empresaId: string) {
    const desativados = await this.desativadosDaEmpresa(empresaId);

    const modulos = await this.prisma.modulo.findMany({
      where: { deletedAt: null },
      orderBy: { ordem: 'asc' },
      include: {
        menus: {
          where: { deletedAt: null, menuPaiId: null },
          orderBy: { ordem: 'asc' },
          include: {
            rotinas: { where: { deletedAt: null }, select: ROTINA_SELECT },
            submenus: {
              where: { deletedAt: null },
              orderBy: { ordem: 'asc' },
              include: {
                rotinas: {
                  where: { deletedAt: null },
                  select: ROTINA_SELECT,
                },
              },
            },
          },
        },
      },
    });

    return modulos.map((modulo) => ({
      ...modulo,
      ativoNaEmpresa: !desativados.modulos.has(modulo.id),
      menus: modulo.menus.map((menu) => ({
        ...menu,
        ativoNaEmpresa: !desativados.menus.has(menu.id),
        rotinas: menu.rotinas.map((rotina) => ({
          ...rotina,
          ativoNaEmpresa: !desativados.rotinas.has(rotina.id),
        })),
        submenus: menu.submenus.map((sub) => ({
          ...sub,
          ativoNaEmpresa: !desativados.menus.has(sub.id),
          rotinas: sub.rotinas.map((rotina) => ({
            ...rotina,
            ativoNaEmpresa: !desativados.rotinas.has(rotina.id),
          })),
        })),
      })),
    }));
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
    await this.validarMenuPai(null, input.menuPaiId ?? null, input.moduloId);
    return this.prisma.menu.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateMenu(id: string, input: MenuUpdate, actorId: string) {
    const atual = await this.ensureMenu(id);
    const moduloId = input.moduloId ?? atual.moduloId;
    const menuPaiId =
      input.menuPaiId === undefined ? atual.menuPaiId : input.menuPaiId;

    await this.validarMenuPai(id, menuPaiId, moduloId);

    return this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.update({
        where: { id },
        data: { ...input, updatedBy: actorId },
      });

      if (input.moduloId && input.moduloId !== atual.moduloId) {
        await tx.menu.updateMany({
          where: { menuPaiId: id, deletedAt: null },
          data: { moduloId: input.moduloId, updatedBy: actorId },
        });
      }

      return menu;
    });
  }

  async removeMenu(id: string, actorId: string) {
    await this.ensureMenu(id);

    const submenus = await this.prisma.menu.count({
      where: { menuPaiId: id, deletedAt: null },
    });
    if (submenus > 0) {
      throw new BadRequestException(
        'Este menu tem submenus. Exclua ou mova os submenus antes.',
      );
    }

    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  private async ensureMenu(id: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id, deletedAt: null },
    });
    if (!menu) {
      throw new NotFoundException('Menu não encontrado');
    }
    return menu;
  }

  private async validarMenuPai(
    menuId: string | null,
    menuPaiId: string | null,
    moduloId: string,
  ) {
    if (!menuPaiId) return;

    if (menuId && menuPaiId === menuId) {
      throw new BadRequestException('Um menu não pode ser pai de si mesmo.');
    }

    const pai = await this.prisma.menu.findFirst({
      where: { id: menuPaiId, deletedAt: null },
    });
    if (!pai) {
      throw new NotFoundException('Menu pai não encontrado');
    }
    if (pai.moduloId !== moduloId) {
      throw new BadRequestException(
        'O menu pai precisa estar no mesmo módulo do submenu.',
      );
    }
    if (pai.menuPaiId) {
      throw new BadRequestException(
        'O menu pai já é um submenu — a hierarquia tem no máximo dois níveis.',
      );
    }

    if (menuId) {
      const filhos = await this.prisma.menu.count({
        where: { menuPaiId: menuId, deletedAt: null },
      });
      if (filhos > 0) {
        throw new BadRequestException(
          'Este menu tem submenus e por isso não pode virar submenu de outro.',
        );
      }
    }
  }

  // Rotinas ------------------------------------------------------------
  listRotinas(menuId?: string): Promise<unknown> {
    return this.prisma.rotina.findMany({
      where: { deletedAt: null, ...(menuId ? { menuId } : {}) },
      orderBy: { nome: 'asc' },
    });
  }

  async createRotina(input: RotinaCreate, actorId: string) {
    await this.ensureMenu(input.menuId);
    return this.prisma.rotina.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateRotina(id: string, input: RotinaUpdate, actorId: string) {
    await this.ensureExists('rotina', id);
    if (input.menuId) {
      await this.ensureMenu(input.menuId);
    }
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
