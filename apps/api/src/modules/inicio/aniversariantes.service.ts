import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ANIVERSARIANTES_JANELA_DIAS,
  type Aniversariante,
} from '@plataforma/contracts';

/** Aniversariantes dos usuarios ativos vinculados a empresa, sem expor o ano. */
@Injectable()
export class AniversariantesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(empresaId: string): Promise<Aniversariante[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vinculos = await tx.usuarioEmpresa.findMany({
        where: {
          empresaId,
          ativo: true,
          deletedAt: null,
          dataNascimento: { not: null },
          usuario: { ativo: true, deletedAt: null },
        },
        select: {
          usuarioId: true,
          dataNascimento: true,
          usuario: { select: { nome: true } },
        },
      });

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const lista = vinculos
        .map((v) => {
          // A data vem como timestamp; o que interessa é dia/mês. Lido em UTC
          // porque é assim que foi gravada — em horário local, um nascimento
          // à meia-noite vira o dia anterior.
          const nascimento = v.dataNascimento!;
          const dia = nascimento.getUTCDate();
          const mes = nascimento.getUTCMonth() + 1;

          // Próxima ocorrência: este ano, ou o ano que vem se já passou. É o
          // que faz dezembro→janeiro funcionar sem caso especial.
          const proxima = new Date(hoje.getFullYear(), mes - 1, dia);
          proxima.setHours(0, 0, 0, 0);
          if (proxima < hoje) proxima.setFullYear(hoje.getFullYear() + 1);

          const emDias = Math.round(
            (proxima.getTime() - hoje.getTime()) / 86_400_000,
          );

          return {
            id: v.usuarioId,
            nome: v.usuario.nome,
            dia,
            mes,
            emDias,
          };
        })
        .filter((a) => a.emDias <= ANIVERSARIANTES_JANELA_DIAS)
        .sort((a, b) => a.emDias - b.emDias);

      return lista;
    });
  }
}
