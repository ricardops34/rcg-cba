import { Injectable } from '@nestjs/common';
import type { UsuarioHorario } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  dentroDoExpediente,
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

  /** O usuário pode acessar agora? */
  async verificar(
    usuarioId: string,
    agora: Date = new Date(),
  ): Promise<ResultadoExpediente> {
    const { restringir, horarios } = await this.carregar(usuarioId);
    return dentroDoExpediente(restringir, horarios, agora);
  }
}
