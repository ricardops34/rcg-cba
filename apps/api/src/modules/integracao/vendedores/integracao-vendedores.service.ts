import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoVendedor,
  IntegracaoVendedorCreate,
  IntegracaoVendedorQuery,
  IntegracaoVendedorUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';

const INCLUDE = {
  supervisorVendedor: { select: { codigoErp: true } },
} satisfies Prisma.VendedorInclude;
type VendedorComSupervisor = Prisma.VendedorGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoVendedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: VendedorComSupervisor): IntegracaoVendedor {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      nome: row.nome,
      nomeReduzido: row.nomeReduzido,
      telefone: row.telefone,
      email: row.email,
      dataNascimento: row.dataNascimento,
      // O contrato com o ERP continua falando em dois booleanos; internamente
      // o papel virou um campo só (Vendedor.tipo). A conversão fica aqui para
      // não quebrar quem já integra.
      vendedor: row.tipo === 'vendedor',
      supervisorCodigo: row.supervisorVendedor?.codigoErp ?? null,
      supervisor: row.tipo === 'supervisor',
      percComissao: row.percComissao,
      ativo: row.ativo,
      desligado: row.desligado,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoVendedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? { nome: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.vendedor.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { nome: 'asc' },
        }),
        tx.vendedor.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(
    empresaId: string,
    codigoErp: string,
  ): Promise<IntegracaoVendedor> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.vendedor.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Vendedor não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoVendedorCreate,
  ): Promise<IntegracaoVendedor> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.vendedor.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

      let supervisorId: string | null = null;
      if (input.supervisorCodigo) {
        const supervisor = await tx.vendedor.findFirst({
          where: {
            empresaId,
            codigoErp: input.supervisorCodigo,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!supervisor) {
          throw new NotFoundException(
            `supervisorCodigo '${input.supervisorCodigo}' não encontrado`,
          );
        }
        supervisorId = supervisor.id;
      }

      // gerente/gerenteId/usuarioId nunca são tocados pelo ERP — vínculos
      // mantidos manualmente na tela (mesmo critério dos imports). Isso vale
      // também na reativação: um vendedor que volta mantém o vínculo com o
      // usuário que tinha.
      const dados = {
        codigoErp: input.codigoErp,
        nome: input.nome,
        nomeReduzido: input.nomeReduzido ?? null,
        telefone: input.telefone ?? null,
        email: input.email ?? null,
        dataNascimento: input.dataNascimento ?? null,
        tipo: input.supervisor ? ('supervisor' as const) : ('vendedor' as const),
        supervisorId,
        percComissao: input.percComissao ?? null,
        // Desligado manda no ativo, como na tela.
        ativo: input.desligado ? false : input.ativo,
        desligado: input.desligado,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.vendedor.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return this.paraLeitura(atualizadoUpsert);
      }

      const criado = await tx.vendedor.create({
        data: { ...dados, empresaId, createdBy: autor },
        include: INCLUDE,
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoVendedorUpdate,
  ): Promise<IntegracaoVendedor> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.vendedor.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Vendedor não encontrado');

      let supervisorId: string | null | undefined = undefined;
      if (input.supervisorCodigo !== undefined) {
        if (input.supervisorCodigo === null) {
          supervisorId = null;
        } else {
          const supervisor = await tx.vendedor.findFirst({
            where: {
              empresaId,
              codigoErp: input.supervisorCodigo,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!supervisor) {
            throw new NotFoundException(
              `supervisorCodigo '${input.supervisorCodigo}' não encontrado`,
            );
          }
          supervisorId = supervisor.id;
        }
      }

      // `gerente` é papel mantido na tela: o ERP não o conhece e não deve
      // rebaixar quem foi promovido aqui. Fora esse caso, os dois booleanos do
      // contrato definem o tipo.
      const tipo =
        existente.tipo === 'gerente' ||
        (input.supervisor === undefined && input.vendedor === undefined)
          ? undefined
          : (input.supervisor ?? existente.tipo === 'supervisor')
            ? ('supervisor' as const)
            : ('vendedor' as const);

      const atualizado = await tx.vendedor.update({
        where: { id: existente.id },
        data: {
          ...(tipo !== undefined ? { tipo } : {}),
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.nomeReduzido !== undefined
            ? { nomeReduzido: input.nomeReduzido }
            : {}),
          ...(input.telefone !== undefined ? { telefone: input.telefone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.dataNascimento !== undefined
            ? { dataNascimento: input.dataNascimento }
            : {}),
          ...(supervisorId !== undefined ? { supervisorId } : {}),
          ...(input.percComissao !== undefined
            ? { percComissao: input.percComissao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          ...(input.desligado !== undefined
            ? { desligado: input.desligado, ativo: !input.desligado }
            : {}),
          updatedBy: autor,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.vendedor.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Vendedor não encontrado');
      await tx.vendedor.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
