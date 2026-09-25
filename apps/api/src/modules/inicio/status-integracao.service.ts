import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface StatusIntegracaoResponse {
  ultimaColeta: string | null;
  ultimoEnvio: string | null;
}

@Injectable()
export class StatusIntegracaoService {
  constructor(private readonly prisma: PrismaService) {}

  async obterStatus(empresaId: string): Promise<StatusIntegracaoResponse> {
    return this.prisma.withTenant(empresaId, async () => {
      // 1. Busca timestamps registrados nas chaves de API da empresa
      const apiKeys = await this.prisma.integracaoApiKey.findMany({
        where: { empresaId, deletedAt: null },
        select: { ultimoUso: true, ultimaColeta: true, ultimoEnvio: true },
      });

      let ultimaColeta: Date | null = null;
      let ultimoEnvio: Date | null = null;

      for (const k of apiKeys) {
        if (k.ultimaColeta && (!ultimaColeta || k.ultimaColeta > ultimaColeta)) {
          ultimaColeta = k.ultimaColeta;
        }
        if (k.ultimoEnvio && (!ultimoEnvio || k.ultimoEnvio > ultimoEnvio)) {
          ultimoEnvio = k.ultimoEnvio;
        }
      }

      // 2. Fallback para ultimaColeta se ainda for nulo (registros integrados existentes)
      if (!ultimaColeta) {
        const [estoque, notaSaida, titulo, produto, cliente] = await Promise.all([
          this.prisma.estoque.findFirst({
            where: { empresaId, deletedAt: null },
            orderBy: { dataEnvio: 'desc' },
            select: { dataEnvio: true, updatedAt: true },
          }),
          this.prisma.notaSaida.findFirst({
            where: { empresaId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
          }),
          this.prisma.tituloReceber.findFirst({
            where: { empresaId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
          }),
          this.prisma.produto.findFirst({
            where: { empresaId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
          }),
          this.prisma.cliente.findFirst({
            where: { empresaId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
          }),
        ]);

        const apiKeyUso = apiKeys.reduce<Date | null>((max, k) => {
          if (!k.ultimoUso) return max;
          return !max || k.ultimoUso > max ? k.ultimoUso : max;
        }, null);

        const datasColeta: (Date | null)[] = [
          estoque?.dataEnvio || estoque?.updatedAt || null,
          notaSaida?.updatedAt || null,
          titulo?.updatedAt || null,
          produto?.updatedAt || null,
          cliente?.updatedAt || null,
          apiKeyUso,
        ];

        for (const d of datasColeta) {
          if (d && (!ultimaColeta || d > ultimaColeta)) {
            ultimaColeta = d;
          }
        }
      }

      // 3. Fallback para ultimoEnvio se nulo (pedidos vinculados ao ERP / API key)
      if (!ultimoEnvio) {
        const orcamentoVinculado = await this.prisma.orcamento.findFirst({
          where: { empresaId, codigoErp: { not: null }, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        });

        const apiKeyUso = apiKeys.reduce<Date | null>((max, k) => {
          if (!k.ultimoUso) return max;
          return !max || k.ultimoUso > max ? k.ultimoUso : max;
        }, null);

        const datasEnvio: (Date | null)[] = [
          orcamentoVinculado?.updatedAt || null,
          apiKeyUso,
        ];

        for (const d of datasEnvio) {
          if (d && (!ultimoEnvio || d > ultimoEnvio)) {
            ultimoEnvio = d;
          }
        }
      }

      return {
        ultimaColeta: ultimaColeta ? ultimaColeta.toISOString() : null,
        ultimoEnvio: ultimoEnvio ? ultimoEnvio.toISOString() : null,
      };
    });
  }
}
