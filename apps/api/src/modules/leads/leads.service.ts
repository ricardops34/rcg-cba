import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';
import type { LeadAtualizar, LeadQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Leads captados pela IA no número institucional.
 *
 * Quem capta é o bot; quem distribui é a supervisão. Este serviço é o lado da
 * distribuição — a captação está em `WhatsappTriagemService.registrarLead`.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O recorte aqui é **diferente** do resto do sistema, e de propósito.
   *
   * Lead não tem carteira: ele é anterior ao cliente. Quem tem equipe vê a fila
   * inteira, porque distribuir é o trabalho dele; quem não tem vê só o que lhe
   * foi entregue. Aplicar o escopo de carteira esconderia da supervisão
   * justamente os leads sem dono, que são todos os que importam.
   */
  async listar(empresaId: string, user: AuthenticatedUser, query: LeadQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const distribui = await this.distribui(tx, empresaId, user, escopo);

      const where = {
        empresaId,
        ...(query.situacao ? { situacao: query.situacao } : {}),
        ...(query.temperatura ? { temperatura: query.temperatura } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  nome: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  empresaInformada: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  interesse: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
        ...(distribui ? {} : { vendedorId: { in: escopo ?? [] } }),
      };

      const [linhas, total] = await Promise.all([
        tx.lead.findMany({
          where,
          ...paginationToSkipTake(query),
          // Quente primeiro, e dentro de cada temperatura o mais antigo antes:
          // lead esfria esperando, e o que está há mais tempo na fila é o que
          // corre mais risco.
          orderBy: [{ temperatura: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.lead.count({ where }),
      ]);

      const vendedorIds = [
        ...new Set(
          linhas.map((l) => l.vendedorId).filter((v): v is string => !!v),
        ),
      ];
      const vendedores = vendedorIds.length
        ? await tx.vendedor.findMany({
            where: { empresaId, id: { in: vendedorIds } },
            select: { id: true, nome: true },
          })
        : [];
      const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

      const data = linhas.map((l) => ({
        ...l,
        vendedorNome: l.vendedorId
          ? (nomePorId.get(l.vendedorId) ?? null)
          : null,
      }));
      return buildPaginatedResult(data, total, query);
    });
  }

  /**
   * Quem tem gente abaixo distribui; quem não tem, recebe.
   *
   * `escopo === null` é "sem restrição de carteira" — Administrador, Diretor, ou
   * quem não tem cadastro de vendedor. Todos esses distribuem.
   */
  private async distribui(
    tx: Parameters<typeof registrarNotificacao>[0],
    empresaId: string,
    user: AuthenticatedUser,
    escopo: string[] | null,
  ) {
    if (escopo === null) return true;
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!vendedor) return true;
    const abaixo = await tx.vendedor.count({
      where: { empresaId, superiorId: vendedor.id, deletedAt: null },
    });
    return abaixo > 0;
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: LeadAtualizar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, empresaId } });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      const direcionou =
        input.vendedorId !== undefined && input.vendedorId !== lead.vendedorId;

      const atualizado = await tx.lead.update({
        where: { id },
        data: {
          ...(input.situacao !== undefined ? { situacao: input.situacao } : {}),
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(input.vendedorId !== undefined
            ? {
                vendedorId: input.vendedorId,
                // Quem assumiu e quando só fazem sentido com dono: devolver o
                // lead à fila limpa os dois, senão o histórico afirma que
                // alguém está cuidando de algo que voltou para ninguém.
                assumidoPor: input.vendedorId ? user.id : null,
                assumidoEm: input.vendedorId ? new Date() : null,
                // A situação acompanha o dono, mas só quando quem chamou não
                // disse qual quer: `situacao` explícita no mesmo PATCH sempre
                // ganha (é como se descarta um lead e se tira o dono de uma
                // vez só).
                //
                // Entregar a alguém tira o lead da fila automaticamente —
                // exigir um segundo passo faria a fila mostrar como "novo" o
                // que já tem dono. E devolver à fila desfaz isso: verificado em
                // dev (2026-09-05), sem esta segunda linha o lead ficava sem
                // dono e ainda "em atendimento", ou seja, fora da aba padrão da
                // tela e sem ninguém cuidando dele.
                ...(input.situacao === undefined &&
                input.vendedorId &&
                lead.situacao === 'novo'
                  ? { situacao: 'em_atendimento' as const }
                  : {}),
                ...(input.situacao === undefined &&
                input.vendedorId === null &&
                lead.situacao === 'em_atendimento'
                  ? { situacao: 'novo' as const }
                  : {}),
              }
            : {}),
        },
      });

      if (direcionou && input.vendedorId) {
        await this.avisarVendedor(tx, empresaId, user, atualizado);
      }

      return atualizado;
    });
  }

  /** O vendedor precisa saber que recebeu — senão o lead espera na tela dele. */
  private async avisarVendedor(
    tx: Parameters<typeof registrarNotificacao>[0],
    empresaId: string,
    user: AuthenticatedUser,
    lead: {
      id: string;
      vendedorId: string | null;
      nome: string | null;
      empresaInformada: string | null;
      telefone: string;
      interesse: string;
    },
  ) {
    if (!lead.vendedorId) return;
    const vendedor = await tx.vendedor.findFirst({
      where: { id: lead.vendedorId, empresaId },
      select: { usuarioId: true },
    });
    if (!vendedor?.usuarioId) return;

    await registrarNotificacao(tx, {
      empresaId,
      usuarioId: vendedor.usuarioId,
      autorUsuarioId: user.id,
      tipo: 'lead_novo',
      titulo: `Lead para você: ${lead.empresaInformada ?? lead.nome ?? lead.telefone}`,
      descricao: lead.interesse,
      rota: `/comercial/leads?lead=${lead.id}`,
      referenciaId: lead.id,
    });
  }
}
