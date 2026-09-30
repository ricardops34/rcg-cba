import { Injectable, Logger } from '@nestjs/common';
import type { UsuarioHorario } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  dentroDoExpediente,
  HORARIO_TIMEZONE,
  type ResultadoExpediente,
} from '../../common/horario/horario-trabalho';

interface EntradaCache {
  restringir: boolean;
  horarios: UsuarioHorario[];
  expiraEm: number;
}

/**
 * Tempo que a configuração de expediente de um usuário fica em memória. A
 * checagem roda em toda requisição autenticada (ver JwtAuthGuard), então ler o
 * banco a cada chamada seria uma consulta extra por request; por outro lado,
 * uma alteração de horário precisa valer rápido. Um minuto equilibra os dois —
 * e quem edita o horário invalida o cache na hora (ver `invalidar`).
 */
const TTL_MS = 60_000;

/**
 * Expediente do usuário, com cache curto — é a fonte que login e guard
 * consultam para decidir se o acesso é permitido neste momento.
 */
@Injectable()
export class HorarioTrabalhoService {
  private readonly logger = new Logger(HorarioTrabalhoService.name);
  private readonly cache = new Map<string, EntradaCache>();

  constructor(private readonly prisma: PrismaService) {}

  /** Descarta o cache de um usuário — chamado ao gravar os horários dele. */
  invalidar(usuarioId: string) {
    this.cache.delete(usuarioId);
  }

  private async carregar(usuarioId: string): Promise<EntradaCache> {
    const emCache = this.cache.get(usuarioId);
    if (emCache && emCache.expiraEm > Date.now()) return emCache;

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        restringirHorario: true,
        horarios: {
          select: { diaSemana: true, horaInicio: true, horaFim: true },
          orderBy: { diaSemana: 'asc' },
        },
      },
    });

    const entrada: EntradaCache = {
      restringir: usuario?.restringirHorario ?? false,
      horarios: usuario?.horarios ?? [],
      expiraEm: Date.now() + TTL_MS,
    };
    this.cache.set(usuarioId, entrada);
    return entrada;
  }

  /** Configuração atual (sem cache) — usada pela tela de cadastro. */
  async obter(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        restringirHorario: true,
        horarios: {
          select: { diaSemana: true, horaInicio: true, horaFim: true },
          orderBy: { diaSemana: 'asc' },
        },
      },
    });
    return {
      restringirHorario: usuario?.restringirHorario ?? false,
      horarios: usuario?.horarios ?? [],
    };
  }

  /**
   * Feriado de hoje na empresa (descrição) ou null. Os feriados são por
   * empresa — RCG e Cuiabá têm os municipais diferentes. Cache por empresa e
   * dia: a tabela muda pouco e o guard pergunta a cada requisição.
   */
  private readonly feriadoCache = new Map<string, { descricao: string | null; expiraEm: number }>();

  private async feriadoDeHoje(empresaId: string, agora: Date): Promise<string | null> {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: HORARIO_TIMEZONE }).format(agora);
    const chave = `${empresaId}:${dia}`;
    const emCache = this.feriadoCache.get(chave);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.descricao;
    // Falha ao ler o feriado não pode virar 500 no login nem em toda
    // requisição: registra e segue sem ele (as faixas por dia continuam valendo).
    const feriado = await this.prisma
      .withTenant(empresaId, (tx) =>
        tx.feriado.findFirst({
          where: { empresaId, data: new Date(`${dia}T00:00:00.000Z`) },
          select: { descricao: true },
        }),
      )
      .catch((erro: unknown) => {
        this.logger.error(`Falha ao ler o feriado de ${empresaId}: ${String(erro)}`);
        return null;
      });
    if (this.feriadoCache.size > 5_000) this.feriadoCache.clear();
    this.feriadoCache.set(chave, { descricao: feriado?.descricao ?? null, expiraEm: Date.now() + 10 * TTL_MS });
    return feriado?.descricao ?? null;
  }

  /**
   * O usuário pode acessar agora? Com `empresaId`, o feriado dela também
   * barra — só quem tem a restrição de horário ligada no cadastro.
   */
  async verificar(
    usuarioId: string,
    empresaId?: string | null,
    agora: Date = new Date(),
  ): Promise<ResultadoExpediente> {
    const { restringir, horarios } = await this.carregar(usuarioId);
    const feriado = restringir && empresaId ? await this.feriadoDeHoje(empresaId, agora) : null;
    return dentroDoExpediente(restringir, horarios, agora, feriado);
  }
}
