import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AssinaturaUpdate } from '@plataforma/contracts';

@Injectable()
export class AssinaturasService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssinaturas() {
    const assinaturas = await this.prisma.assinatura.findMany({
      where: {
        grupoEconomicoId: { not: null },
        grupoEconomico: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        grupoEconomico: {
          select: {
            id: true,
            descricao: true,
            _count: { select: { empresas: { where: { deletedAt: null } } } },
          },
        },
        plano: true,
      },
    });
    return assinaturas.map((a) => ({
      ...a,
      valorMensalidade: Number(a.valorMensalidade),
      plano: {
        ...a.plano,
        valorMensal: Number(a.plano.valorMensal),
        valorTrimestral: Number(a.plano.valorTrimestral),
        valorSemestral: Number(a.plano.valorSemestral),
        valorAnual: Number(a.plano.valorAnual),
      },
    }));
  }

  async getResumoSaaS() {
    const assinaturas = await this.prisma.assinatura.findMany({
      where: {
        grupoEconomicoId: { not: null },
        grupoEconomico: { deletedAt: null },
      },
      select: { valorMensalidade: true, ciclo: true, situacao: true },
    });
    const mrr = assinaturas
      .filter((a) => a.situacao === 'ativa')
      .reduce((acc, a) => {
        const meses = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
        return acc + Number(a.valorMensalidade) / meses[a.ciclo];
      }, 0);
    return {
      mrr: Math.round(mrr * 100) / 100,
      totalEmpresas: await this.prisma.empresa.count({
        where: { deletedAt: null },
      }),
      ativas: assinaturas.filter((a) => a.situacao === 'ativa').length,
      emTeste: assinaturas.filter((a) => a.situacao === 'teste').length,
      inadimplentes: assinaturas.filter((a) => a.situacao === 'atrasada')
        .length,
    };
  }

  private async grupoDaEmpresa(empresaId: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: { grupoEconomicoId: true },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    return empresa.grupoEconomicoId;
  }

  async getAssinaturaEmpresa(empresaId: string) {
    return this.getAssinaturaGrupo(await this.grupoDaEmpresa(empresaId));
  }

  async getAssinaturaGrupo(grupoEconomicoId: string) {
    const grupo = await this.prisma.grupoEconomico.findFirst({
      where: { id: grupoEconomicoId, deletedAt: null },
    });
    if (!grupo) throw new NotFoundException('Grupo econômico não encontrado');
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { grupoEconomicoId },
      include: { plano: true },
    });
    if (!assinatura) return null;
    return {
      ...assinatura,
      valorMensalidade: Number(assinatura.valorMensalidade),
      plano: {
        ...assinatura.plano,
        valorMensal: Number(assinatura.plano.valorMensal),
        valorTrimestral: Number(assinatura.plano.valorTrimestral),
        valorSemestral: Number(assinatura.plano.valorSemestral),
        valorAnual: Number(assinatura.plano.valorAnual),
      },
    };
  }

  async updateAssinaturaEmpresa(
    empresaId: string,
    input: AssinaturaUpdate,
    actorId: string,
  ) {
    return this.updateAssinaturaGrupo(
      await this.grupoDaEmpresa(empresaId),
      input,
      actorId,
    );
  }

  async updateAssinaturaGrupo(
    grupoEconomicoId: string,
    input: AssinaturaUpdate,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grupos_economicos WHERE id = ${grupoEconomicoId} FOR UPDATE`;
      const grupo = await tx.grupoEconomico.findFirst({
        where: { id: grupoEconomicoId, deletedAt: null },
      });
      if (!grupo) throw new NotFoundException('Grupo econômico não encontrado');
      const atual = await tx.assinatura.findUnique({
        where: { grupoEconomicoId },
      });
      const planoId = input.planoId ?? atual?.planoId;
      if (!planoId) throw new BadRequestException('Selecione o plano do grupo');
      const plano = await tx.plano.findFirst({
        where: { id: planoId, deletedAt: null },
      });
      if (!plano) throw new BadRequestException('Plano informado não existe');
      if ((!atual || atual.planoId !== planoId) && !plano.ativo)
        throw new BadRequestException(
          'Plano indisponível para novas assinaturas',
        );
      const assinatura = await tx.assinatura.upsert({
        where: { grupoEconomicoId },
        create: {
          ...input,
          grupoEconomicoId,
          planoId,
          valorMensalidade: input.valorMensalidade ?? plano.valorMensal,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: { ...input, updatedBy: actorId },
      });
      const situacao =
        assinatura.situacao === 'atrasada' ? 'suspensa' : assinatura.situacao;
      await tx.empresa.updateMany({
        where: { grupoEconomicoId, deletedAt: null },
        data: {
          situacao,
          limiteUsuarios: plano.limiteUsuarios,
          updatedBy: actorId,
          ...(situacao !== 'teste' ? { testeExpiraEm: null } : {}),
        },
      });
      return {
        ...assinatura,
        valorMensalidade: Number(assinatura.valorMensalidade),
      };
    });
  }
}
