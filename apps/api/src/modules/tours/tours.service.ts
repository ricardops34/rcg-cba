import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AtualizarTourInput,
  IniciarTourInput,
  TourEstado,
  TourExecucao,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  async estado(
    user: AuthenticatedUser,
    codigo: string,
    versao: number,
  ): Promise<TourEstado> {
    return this.prisma.withTenant(user.empresaAtivaId, async (tx) => {
      const ultima = await tx.tourExecucao.findFirst({
        where: {
          empresaId: user.empresaAtivaId,
          usuarioId: user.id,
          tourCodigo: codigo,
          versao,
        },
        orderBy: { iniciadoEm: 'desc' },
      });

      return {
        // Uma versão exibida ou dispensada não reaparece sozinha. O botão
        // de replay sempre cria outra execução manual.
        deveIniciarAutomaticamente: ultima === null,
        ultimaExecucao: ultima ? this.paraContrato(ultima) : null,
      };
    });
  }

  async iniciar(
    user: AuthenticatedUser,
    codigo: string,
    input: IniciarTourInput,
  ): Promise<TourExecucao> {
    return this.prisma.withTenant(user.empresaAtivaId, async (tx) => {
      if (input.origem === 'automatico') {
        const existente = await tx.tourExecucao.findFirst({
          where: {
            empresaId: user.empresaAtivaId,
            usuarioId: user.id,
            tourCodigo: codigo,
            versao: input.versao,
          },
          orderBy: { iniciadoEm: 'desc' },
        });
        if (existente) return this.paraContrato(existente);
      }

      const execucao = await tx.tourExecucao.create({
        data: {
          empresaId: user.empresaAtivaId,
          usuarioId: user.id,
          tourCodigo: codigo,
          versao: input.versao,
          origem: input.origem,
        },
      });
      return this.paraContrato(execucao);
    });
  }

  async atualizar(
    user: AuthenticatedUser,
    id: string,
    input: AtualizarTourInput,
  ): Promise<TourExecucao> {
    return this.prisma.withTenant(user.empresaAtivaId, async (tx) => {
      const result = await tx.tourExecucao.updateMany({
        where: {
          id,
          empresaId: user.empresaAtivaId,
          usuarioId: user.id,
        },
        data: {
          passoAtual: input.passoAtual,
          status: input.status,
          finalizadoEm: input.status === 'em_andamento' ? null : new Date(),
        },
      });
      if (result.count === 0) {
        throw new NotFoundException('Execução do tour não encontrada');
      }

      const execucao = await tx.tourExecucao.findFirstOrThrow({
        where: { id, usuarioId: user.id },
      });
      return this.paraContrato(execucao);
    });
  }

  private paraContrato(execucao: {
    id: string;
    tourCodigo: string;
    versao: number;
    origem: 'automatico' | 'manual';
    status: 'em_andamento' | 'concluido' | 'dispensado';
    passoAtual: number;
    iniciadoEm: Date;
    finalizadoEm: Date | null;
  }): TourExecucao {
    return {
      id: execucao.id,
      tourCodigo: execucao.tourCodigo,
      versao: execucao.versao,
      origem: execucao.origem,
      status: execucao.status,
      passoAtual: execucao.passoAtual,
      iniciadoEm: execucao.iniciadoEm.toISOString(),
      finalizadoEm: execucao.finalizadoEm?.toISOString() ?? null,
    };
  }
}
