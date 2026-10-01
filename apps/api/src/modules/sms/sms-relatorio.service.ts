import { Injectable } from '@nestjs/common';
import type { Prisma, SmsMotivo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Filtros da tela Administração > SMS. */
export type FiltroSms = {
  ano: number;
  /** 1–12; ausente = o ano inteiro. */
  mes?: number;
  motivo?: SmsMotivo;
  /** Situação agrupada: entregue, falha, aguardando. */
  situacao?: 'entregue' | 'falha' | 'aguardando';
  page?: number;
  pageSize?: number;
};

/**
 * Situação agrupada a partir do status da iAgente. Os textos dela variam
 * (Entregue, Visualizada, Falha operadora, Recusada...); a tela pergunta três
 * coisas: chegou, falhou, ou ainda não se sabe.
 */
export function situacaoDoStatus(
  status: string,
): 'entregue' | 'falha' | 'aguardando' {
  const s = status.trim().toLowerCase();
  if (
    ['entregue', 'visualizada', 'clique em um link', 'resposta'].includes(s)
  ) {
    return 'entregue';
  }
  if (
    s === 'erro' ||
    s.includes('falha') ||
    s.includes('recusad') ||
    s.includes('nao entreg') ||
    s.includes('não entreg') ||
    s.includes('nao suportad') ||
    s.includes('não suportad')
  ) {
    return 'falha';
  }
  return 'aguardando';
}

const STATUS_ENTREGUE = [
  'Entregue',
  'Visualizada',
  'Clique em um link',
  'Resposta',
];
const STATUS_FALHA = [
  'erro',
  'Falha operadora',
  'Recusada',
  'Não entregável',
  'Não suportada',
];

function periodo(f: FiltroSms) {
  const inicio = new Date(Date.UTC(f.ano, (f.mes ?? 1) - 1, 1, 3));
  const fim = f.mes
    ? new Date(Date.UTC(f.ano, f.mes, 1, 3))
    : new Date(Date.UTC(f.ano + 1, 0, 1, 3));
  return { gte: inicio, lt: fim };
}

/**
 * Estatística e histórico dos envios de SMS, por ano e mês (pedido do
 * usuário, 01/10/2026). O período é o mês civil de Brasília (UTC-3).
 */
@Injectable()
export class SmsRelatorioService {
  constructor(private readonly prisma: PrismaService) {}

  private where(empresaId: string, f: FiltroSms): Prisma.SmsEnvioWhereInput {
    return {
      empresaId,
      createdAt: periodo(f),
      ...(f.motivo ? { motivo: f.motivo } : {}),
      ...(f.situacao === 'entregue'
        ? { status: { in: STATUS_ENTREGUE } }
        : f.situacao === 'falha'
          ? { status: { in: STATUS_FALHA } }
          : f.situacao === 'aguardando'
            ? { status: { notIn: [...STATUS_ENTREGUE, ...STATUS_FALHA] } }
            : {}),
    };
  }

  async estatisticas(empresaId: string, f: FiltroSms) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = this.where(empresaId, { ...f, situacao: undefined });
      const [porStatus, porMotivo, respostas, porMes] = await Promise.all([
        tx.smsEnvio.groupBy({ by: ['status'], where, _count: { _all: true } }),
        tx.smsEnvio.groupBy({ by: ['motivo'], where, _count: { _all: true } }),
        tx.smsResposta.count({
          where: { empresaId, recebidaEm: periodo(f) },
        }),
        // Evolução do ano, mês a mês — independe do filtro de mês.
        tx.$queryRaw<Array<{ mes: number; total: bigint }>>`
          SELECT EXTRACT(MONTH FROM ("createdAt" - interval '3 hours'))::int AS mes,
                 COUNT(*)::bigint AS total
            FROM sms_envios
           WHERE "empresaId" = ${empresaId}
             AND "createdAt" >= ${periodo({ ano: f.ano }).gte}
             AND "createdAt" < ${periodo({ ano: f.ano }).lt}
           GROUP BY 1 ORDER BY 1`,
      ]);

      const situacoes = { entregue: 0, falha: 0, aguardando: 0 };
      for (const linha of porStatus) {
        situacoes[situacaoDoStatus(linha.status)] += linha._count._all;
      }
      const total = situacoes.entregue + situacoes.falha + situacoes.aguardando;
      return {
        total,
        ...situacoes,
        respostas,
        porMotivo: porMotivo.map((m) => ({
          motivo: m.motivo,
          total: m._count._all,
        })),
        porMes: Array.from({ length: 12 }, (_, i) => ({
          mes: i + 1,
          total: Number(porMes.find((m) => m.mes === i + 1)?.total ?? 0),
        })),
      };
    });
  }

  async envios(empresaId: string, f: FiltroSms) {
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20));
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = this.where(empresaId, f);
      const [linhas, total] = await Promise.all([
        tx.smsEnvio.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            respostas: {
              orderBy: { recebidaEm: 'asc' },
              select: { id: true, mensagem: true, recebidaEm: true },
            },
          },
        }),
        tx.smsEnvio.count({ where }),
      ]);
      const clienteIds = [
        ...new Set(linhas.map((l) => l.clienteId).filter(Boolean)),
      ] as string[];
      const clientes = clienteIds.length
        ? await tx.cliente.findMany({
            where: { id: { in: clienteIds } },
            select: { id: true, razaoSocial: true, nomeFantasia: true },
          })
        : [];
      const nomes = new Map(
        clientes.map((c) => [c.id, c.nomeFantasia || c.razaoSocial]),
      );
      return {
        data: linhas.map((l) => ({
          id: l.id,
          createdAt: l.createdAt.toISOString(),
          motivo: l.motivo,
          celular: l.celular,
          mensagem: l.mensagem,
          clienteId: l.clienteId,
          clienteNome: l.clienteId ? (nomes.get(l.clienteId) ?? null) : null,
          status: l.status,
          situacao: situacaoDoStatus(l.status),
          statusEm: l.statusEm?.toISOString() ?? null,
          erro: l.erro,
          respostas: l.respostas.map((r) => ({
            id: r.id,
            mensagem: r.mensagem,
            recebidaEm: r.recebidaEm.toISOString(),
          })),
        })),
        total,
        page,
        pageSize,
      };
    });
  }
}
