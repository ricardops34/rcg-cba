import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  AcompanhamentoQuery,
  MetaCreate,
  MetaUpdate,
  PaginationQuery,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class MetasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * IDs dos colaboradores que o usuário logado supervisiona: toda a subárvore
   * abaixo do seu próprio colaborador (subordinados diretos e indiretos).
   * Admins (isAdmin) enxergam todos os colaboradores da empresa; um usuário
   * sem colaborador vinculado enxerga apenas a si mesmo (nada, na prática).
   * Retorna `null` quando não há restrição (admin) — o chamador então não filtra.
   */
  private async equipeIds(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (user.isAdmin) return null;

    const colaboradores = await tx.colaborador.findMany({
      where: { empresaId, deletedAt: null },
      select: { id: true, superiorId: true, usuarioId: true },
    });

    const eu = colaboradores.find((c) => c.usuarioId === user.id);
    if (!eu) return [];

    const filhosPor = new Map<string, string[]>();
    for (const c of colaboradores) {
      if (!c.superiorId) continue;
      const arr = filhosPor.get(c.superiorId) ?? [];
      arr.push(c.id);
      filhosPor.set(c.superiorId, arr);
    }

    const equipe: string[] = [];
    const fila = [...(filhosPor.get(eu.id) ?? [])];
    const visto = new Set<string>();
    while (fila.length) {
      const id = fila.shift()!;
      if (visto.has(id)) continue;
      visto.add(id);
      equipe.push(id);
      fila.push(...(filhosPor.get(id) ?? []));
    }
    // Inclui o próprio gestor, para que ele também possa ter/ver a própria meta.
    equipe.push(eu.id);
    return equipe;
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: PaginationQuery & { ano?: number; mes?: number }) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await this.equipeIds(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        ...(query.ano ? { ano: Number(query.ano) } : {}),
        ...(query.mes ? { mes: Number(query.mes) } : {}),
        ...(query.search
          ? {
              colaborador: {
                usuario: { nome: { contains: query.search, mode: 'insensitive' as const } },
              },
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.metaVendedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
          include: {
            colaborador: {
              select: {
                id: true,
                cargo: true,
                codigoErp: true,
                nomeReduzido: true,
                usuario: { select: { nome: true, email: true } },
              },
            },
          },
        }),
        tx.metaVendedor.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async create(empresaId: string, user: AuthenticatedUser, input: MetaCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.assertNaEquipe(tx, empresaId, user, input.colaboradorId);
      return tx.metaVendedor.create({
        data: {
          empresaId,
          colaboradorId: input.colaboradorId,
          ano: input.ano,
          mes: input.mes,
          valorObjetivo: input.valorObjetivo,
          metaClientes: input.metaClientes,
          metaNovosClientes: input.metaNovosClientes,
          valorRealizado: input.valorRealizado,
          clientesPositivados: input.clientesPositivados,
          observacao: input.observacao,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: MetaUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const meta = await tx.metaVendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!meta) throw new NotFoundException('Meta não encontrada');
      await this.assertNaEquipe(tx, empresaId, user, meta.colaboradorId);
      return tx.metaVendedor.update({
        where: { id },
        data: { ...input, updatedBy: user.id },
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const meta = await tx.metaVendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!meta) throw new NotFoundException('Meta não encontrada');
      await this.assertNaEquipe(tx, empresaId, user, meta.colaboradorId);
      return tx.metaVendedor.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
    });
  }

  private async assertNaEquipe(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    colaboradorId: string,
  ) {
    const equipe = await this.equipeIds(tx, empresaId, user);
    if (equipe && !equipe.includes(colaboradorId)) {
      throw new ForbiddenException('Este vendedor não faz parte da sua equipe');
    }
  }

  /** Consolidado do mês para a equipe supervisionada pelo usuário logado. */
  acompanhamento(empresaId: string, user: AuthenticatedUser, query: AcompanhamentoQuery) {
    const ano = Number(query.ano);
    const mes = Number(query.mes);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await this.equipeIds(tx, empresaId, user);

      const colaboradores = await tx.colaborador.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          cargo: { in: ['vendedor', 'supervisor'] },
          ...(equipe ? { id: { in: equipe } } : {}),
        },
        select: {
          id: true,
          cargo: true,
          codigoErp: true,
          nomeReduzido: true,
          usuario: { select: { nome: true } },
          superior: { select: { usuario: { select: { nome: true } } } },
        },
      });

      const ids = colaboradores.map((c) => c.id);
      const metas = await tx.metaVendedor.findMany({
        where: { empresaId, deletedAt: null, ano, mes, colaboradorId: { in: ids } },
      });
      const metaPor = new Map(metas.map((m) => [m.colaboradorId, m]));

      const linhas = colaboradores
        .map((c) => {
          const m = metaPor.get(c.id);
          const valorObjetivo = m?.valorObjetivo ?? 0;
          const valorRealizado = m?.valorRealizado ?? 0;
          return {
            colaboradorId: c.id,
            nome: c.usuario.nome,
            nomeReduzido: c.nomeReduzido,
            codigoErp: c.codigoErp,
            cargo: c.cargo,
            superiorNome: c.superior?.usuario.nome ?? null,
            valorObjetivo,
            valorRealizado,
            metaClientes: m?.metaClientes ?? 0,
            clientesPositivados: m?.clientesPositivados ?? 0,
            percentual: valorObjetivo > 0 ? (valorRealizado / valorObjetivo) * 100 : 0,
          };
        })
        .sort((a, b) => b.valorRealizado - a.valorRealizado);

      const totalObjetivo = linhas.reduce((s, l) => s + l.valorObjetivo, 0);
      const totalRealizado = linhas.reduce((s, l) => s + l.valorRealizado, 0);

      return {
        ano,
        mes,
        totalObjetivo,
        totalRealizado,
        percentualGeral: totalObjetivo > 0 ? (totalRealizado / totalObjetivo) * 100 : 0,
        totalVendedores: linhas.length,
        comMeta: metas.length,
        linhas,
      };
    });
  }
}
