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

/**
 * Campos da rotina que o menu lateral precisa. `disponivelTelaPequena` faltava
 * aqui e o cliente lê `rotinas.some((r) => r.disponivelTelaPequena)`: com o
 * campo ausente a conta dava sempre falso e, abaixo de 768 px, a barra lateral
 * vinha vazia e toda rotina caía no aviso "abra em uma tela maior".
 */
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
  /**
   * Árvore que monta o menu lateral: só o que está ativo.
   *
   * O `ativo` do módulo vale em cascata **na leitura** — desligar o CRM tira do
   * ar os menus e rotinas dele sem gravar `ativo: false` em cada um, então
   * religar devolve a configuração exatamente como estava.
   *
   * Para administrar a estrutura (e reativar o que foi desligado) existe
   * `listArvore`: aqui o inativo é invisível de propósito.
   */
  listModulos(): Promise<unknown> {
    return this.prisma.modulo.findMany({
      where: { deletedAt: null, ativo: true },
      orderBy: { ordem: 'asc' },
      include: {
        menus: {
          // Só a raiz: os submenus vêm aninhados dentro do pai.
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
  }

  /**
   * Árvore completa para a tela de Estrutura de Menu — **inclui o inativo**,
   * que é justamente o que precisa aparecer para poder ser religado.
   */
  listArvore(): Promise<unknown> {
    return this.prisma.modulo.findMany({
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

      // Submenu não muda de módulo sozinho: se o pai fosse para outro módulo e
      // os filhos ficassem para trás, eles sumiriam do menu (a listagem só
      // busca submenu dentro do módulo do pai) sem nenhuma tela mostrando onde
      // foram parar.
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

  /** Como `ensureExists`, mas devolvendo o menu tipado (o outro é genérico). */
  private async ensureMenu(id: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id, deletedAt: null },
    });
    if (!menu) {
      throw new NotFoundException('Menu não encontrado');
    }
    return menu;
  }

  /**
   * A hierarquia de menu tem **dois níveis**: menu e submenu, sem neto. É o que
   * a barra lateral sabe desenhar, então um terceiro nível viraria um item
   * invisível — melhor recusar aqui do que aceitar e sumir com ele.
   */
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
    // Mover de menu é trocar o `menuId`. O `codigo` não muda junto (a tela
    // nem deixa editá-lo depois de criado), então as permissões já concedidas
    // nos perfis continuam valendo — elas apontam para a rotina, não para o
    // lugar dela na árvore.
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
