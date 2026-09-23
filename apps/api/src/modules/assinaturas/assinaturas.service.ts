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
      orderBy: { createdAt: 'desc' },
      include: {
        empresa: {
          select: {
            id: true,
            razaoSocial: true,
            nomeFantasia: true,
            cnpj: true,
            situacao: true,
          },
        },
        plano: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            valorMensal: true,
            valorTrimestral: true,
            valorSemestral: true,
            valorAnual: true,
          },
        },
      },
    });

    return assinaturas.map((a) => ({
      ...a,
      valorMensalidade: Number(a.valorMensalidade),
      plano: a.plano
        ? {
            ...a.plano,
            valorMensal: Number(a.plano.valorMensal),
            valorTrimestral: Number(a.plano.valorTrimestral),
            valorSemestral: Number(a.plano.valorSemestral),
            valorAnual: Number(a.plano.valorAnual),
          }
        : null,
    }));
  }

  async getResumoSaaS() {
    const assinaturas = await this.prisma.assinatura.findMany({
      where: { situacao: 'ativa' },
      select: { valorMensalidade: true, ciclo: true },
    });

    const mrr = assinaturas.reduce((acc, curr) => {
      const val = Number(curr.valorMensalidade);
      if (curr.ciclo === 'anual') return acc + val / 12;
      if (curr.ciclo === 'semestral') return acc + val / 6;
      if (curr.ciclo === 'trimestral') return acc + val / 3;
      return acc + val;
    }, 0);

    const [totalEmpresas, ativas, emTeste, inadimplentes] = await Promise.all([
      this.prisma.empresa.count({ where: { deletedAt: null } }),
      this.prisma.assinatura.count({ where: { situacao: 'ativa' } }),
      this.prisma.assinatura.count({ where: { situacao: 'teste' } }),
      this.prisma.assinatura.count({ where: { situacao: 'atrasada' } }),
    ]);

    return {
      mrr: Math.round(mrr * 100) / 100,
      totalEmpresas,
      ativas,
      emTeste,
      inadimplentes,
    };
  }

  async getAssinaturaEmpresa(empresaId: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
    });
    if (!empresa) {
      throw new NotFoundException('Empresa não encontrada');
    }

    let assinatura = await this.prisma.assinatura.findFirst({
      where: { empresaId },
      include: {
        plano: true,
      },
    });

    if (!assinatura) {
      let planoPadrao = await this.prisma.plano.findFirst({
        where: { deletedAt: null, ativo: true },
        orderBy: { valorMensal: 'asc' },
      });

      if (!planoPadrao) {
        planoPadrao = await this.prisma.plano.create({
          data: {
            nome: 'Plano Padrão',
            codigo: 'padrao',
            descricao: 'Plano padrão inicial do sistema',
            valorMensal: 0,
            valorTrimestral: 0,
            valorSemestral: 0,
            valorAnual: 0,
          },
        });
      }

      assinatura = await this.prisma.assinatura.create({
        data: {
          empresaId,
          planoId: planoPadrao.id,
          situacao: 'teste',
          valorMensalidade: planoPadrao.valorMensal,
          diaVencimento: 10,
        },
        include: {
          plano: true,
        },
      });
    }

    return {
      ...assinatura,
      valorMensalidade: Number(assinatura.valorMensalidade),
      plano: assinatura.plano
        ? {
            ...assinatura.plano,
            valorMensal: Number(assinatura.plano.valorMensal),
            valorTrimestral: Number(assinatura.plano.valorTrimestral),
            valorSemestral: Number(assinatura.plano.valorSemestral),
            valorAnual: Number(assinatura.plano.valorAnual),
          }
        : null,
    };
  }

  async updateAssinaturaEmpresa(
    empresaId: string,
    input: AssinaturaUpdate,
    actorId: string,
  ) {
    await this.getAssinaturaEmpresa(empresaId);

    if (input.planoId) {
      const plano = await this.prisma.plano.findFirst({
        where: { id: input.planoId, deletedAt: null },
      });
      if (!plano) {
        throw new BadRequestException('Plano informado não existe.');
      }
    }

    const updated = await this.prisma.assinatura.update({
      where: { empresaId },
      data: {
        ...input,
        updatedBy: actorId,
      },
      include: {
        plano: true,
      },
    });

    return {
      ...updated,
      valorMensalidade: Number(updated.valorMensalidade),
    };
  }
}
