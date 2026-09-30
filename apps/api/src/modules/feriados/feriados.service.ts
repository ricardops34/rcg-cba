import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FeriadoCreate, FeriadoUpdate } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HORARIO_TIMEZONE } from '../../common/horario/horario-trabalho';
import { feriadosNacionais } from '../../common/horario/feriados-nacionais';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

type FeriadoRow = {
  id: string;
  empresaId: string;
  data: Date;
  descricao: string;
  origem: string;
  createdAt: Date;
  updatedAt: Date;
};

/** "AAAA-MM-DD" ↔ coluna `date`: o Prisma lê e grava `date` como meia-noite UTC. */
const paraData = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const paraDia = (data: Date) => data.toISOString().slice(0, 10);

const apresentar = (f: FeriadoRow) => ({
  id: f.id,
  empresaId: f.empresaId,
  data: paraDia(f.data),
  descricao: f.descricao,
  origem: f.origem,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
});

const ehDuplicado = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Cadastro de feriados da empresa ativa. O corte por empresa é o RLS da
 * tabela, como nas demais de negócio.
 *
 * Toda gravação descarta o feriado em cache da trava de horário
 * (HorarioTrabalhoService), para que incluir ou excluir o feriado de hoje
 * valha na hora, não só quando o cache vencer.
 */
@Injectable()
export class FeriadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horarios: HorarioTrabalhoService,
  ) {}

  findAll(empresaId: string, ano?: number) {
    const doAno =
      ano ??
      Number(new Intl.DateTimeFormat('en-CA', { timeZone: HORARIO_TIMEZONE, year: 'numeric' }).format(new Date()));
    return this.prisma.withTenant(empresaId, async (tx) => {
      const lista = await tx.feriado.findMany({
        where: {
          empresaId,
          data: { gte: paraData(`${doAno}-01-01`), lte: paraData(`${doAno}-12-31`) },
        },
        orderBy: { data: 'asc' },
      });
      return lista.map(apresentar);
    });
  }

  async findOne(empresaId: string, id: string) {
    const feriado = await this.prisma.withTenant(empresaId, (tx) =>
      tx.feriado.findFirst({ where: { id, empresaId } }),
    );
    if (!feriado) throw new NotFoundException('Feriado não encontrado');
    return apresentar(feriado);
  }

  async create(empresaId: string, user: AuthenticatedUser, input: FeriadoCreate) {
    try {
      const feriado = await this.prisma.withTenant(empresaId, (tx) =>
        tx.feriado.create({
          data: {
            empresaId,
            data: paraData(input.data),
            descricao: input.descricao,
            origem: 'manual',
            createdBy: user.id,
          },
        }),
      );
      this.horarios.invalidarFeriados(empresaId);
      return apresentar(feriado);
    } catch (err) {
      if (ehDuplicado(err)) throw new ConflictException('Já existe um feriado nesta data');
      throw err;
    }
  }

  /**
   * Editar um feriado gerado o torna "da empresa": a origem passa a `manual`,
   * que é o que diz que alguém decidiu aquela data e descrição.
   */
  async update(empresaId: string, user: AuthenticatedUser, id: string, input: FeriadoUpdate) {
    await this.findOne(empresaId, id);
    try {
      const feriado = await this.prisma.withTenant(empresaId, (tx) =>
        tx.feriado.update({
          where: { id },
          data: {
            ...(input.data ? { data: paraData(input.data) } : {}),
            ...(input.descricao ? { descricao: input.descricao } : {}),
            origem: 'manual',
            updatedBy: user.id,
          },
        }),
      );
      this.horarios.invalidarFeriados(empresaId);
      return apresentar(feriado);
    } catch (err) {
      if (ehDuplicado(err)) throw new ConflictException('Já existe um feriado nesta data');
      throw err;
    }
  }

  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    await this.prisma.withTenant(empresaId, (tx) => tx.feriado.delete({ where: { id } }));
    this.horarios.invalidarFeriados(empresaId);
    return { ok: true };
  }

  /**
   * Grava os feriados nacionais do ano. Data que já tem feriado fica como
   * está — inclusive um nacional que alguém editou ou excluiu e recriou à mão.
   */
  async gerarNacionais(empresaId: string, user: AuthenticatedUser, ano: number) {
    const nacionais = feriadosNacionais(ano);
    const { count } = await this.prisma.withTenant(empresaId, (tx) =>
      tx.feriado.createMany({
        data: nacionais.map((f) => ({
          empresaId,
          data: paraData(f.data),
          descricao: f.nome,
          origem: f.origem,
          createdBy: user.id,
        })),
        skipDuplicates: true,
      }),
    );
    this.horarios.invalidarFeriados(empresaId);
    return { criados: count, existentes: nacionais.length - count };
  }
}
