import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ANIVERSARIANTES_JANELA_DIAS,
  type Aniversariante,
} from '@plataforma/contracts';

/**
 * Aniversariantes da equipe, para a tela inicial.
 *
 * **Não usa o escopo hierárquico**, e a diferença é deliberada: por
 * `resolverEscopoVendedores`, um vendedor de carteira enxerga só a si mesmo —
 * a seção mostraria o próprio aniversário e mais nada. Aniversário de colega
 * não é dado de carteira; é a lista da empresa inteira, e o que sai dela é
 * nome e dia, nunca o ano.
 *
 * Cadastro de sistema (ESCRITORIO, E-COMMERCE) e desligado ficam de fora: não
 * são pessoas a parabenizar.
 */
@Injectable()
export class AniversariantesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(empresaId: string): Promise<Aniversariante[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedores = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          desligado: false,
          dataNascimento: { not: null },
          // `vinculo` é nulo na base inteira hoje (o import do ERP não traz),
          // e `{ not: 'sistema' }` sozinho **descartaria todo mundo**: em SQL,
          // `NULL <> 'sistema'` não é verdadeiro. O OR explícito é o que faz
          // "não é cadastro de sistema" incluir quem não tem vínculo definido.
          OR: [{ vinculo: null }, { vinculo: { not: 'sistema' } }],
        },
        select: {
          id: true,
          nome: true,
          nomeReduzido: true,
          dataNascimento: true,
        },
      });

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const lista = vendedores
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
            id: v.id,
            nome: v.nomeReduzido || v.nome,
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
