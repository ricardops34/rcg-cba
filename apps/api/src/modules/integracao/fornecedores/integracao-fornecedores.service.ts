import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoFornecedor,
  IntegracaoFornecedorCreate,
  IntegracaoFornecedorQuery,
  IntegracaoFornecedorUpdate,
  IntegracaoFornecedorLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';

type FornecedorRow = Prisma.FornecedorGetPayload<object>;

@Injectable()
export class IntegracaoFornecedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: FornecedorRow): IntegracaoFornecedor {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      tipoPessoa: row.tipoPessoa,
      razaoSocial: row.razaoSocial,
      nomeFantasia: row.nomeFantasia,
      cnpjCpf: row.cnpjCpf,
      inscricaoEstadual: row.inscricaoEstadual,
      inscricaoMunicipal: row.inscricaoMunicipal,
      contato: row.contato,
      email: row.email,
      telefone: row.telefone,
      celular: row.celular,
      endereco: row.endereco,
      complemento: row.complemento,
      bairro: row.bairro,
      municipio: row.municipio,
      uf: row.uf,
      cep: row.cep,
      observacao: row.observacao,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoFornecedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  razaoSocial: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  cnpjCpf: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.fornecedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { razaoSocial: 'asc' },
        }),
        tx.fornecedor.count({ where }),
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
    chave: string,
  ): Promise<IntegracaoFornecedor> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.fornecedor.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!row) throw new NotFoundException('Fornecedor não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoFornecedorCreate,
  ): Promise<IntegracaoFornecedor> {
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu** — só o
   * lote precisa disso, para separar `criados` de `atualizados`.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoFornecedorCreate,
  ): Promise<{ registro: IntegracaoFornecedor; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      // Sem `deletedAt: null` de propósito: é o que permite reativar um
      // fornecedor que o ERP mandar de volta.
      const existente = await tx.fornecedor.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? null,
        tipoPessoa: input.tipoPessoa,
        razaoSocial: input.razaoSocial,
        nomeFantasia: input.nomeFantasia ?? null,
        cnpjCpf: input.cnpjCpf ?? null,
        inscricaoEstadual: input.inscricaoEstadual ?? null,
        inscricaoMunicipal: input.inscricaoMunicipal ?? null,
        contato: input.contato ?? null,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        celular: input.celular ?? null,
        endereco: input.endereco ?? null,
        complemento: input.complemento ?? null,
        bairro: input.bairro ?? null,
        municipio: input.municipio ?? null,
        uf: input.uf ?? null,
        cep: input.cep ?? null,
        observacao: input.observacao ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizado = await tx.fornecedor.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
        });
        return { registro: this.paraLeitura(atualizado), decisao };
      }

      const criado = await tx.fornecedor.create({
        data: { ...dados, empresaId, createdBy: autor },
      });
      return { registro: this.paraLeitura(criado), decisao };
    });
  }

  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoFornecedorLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoFornecedorCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoFornecedorUpdate,
  ): Promise<IntegracaoFornecedor> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.fornecedor.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Fornecedor não encontrado');

      const atualizado = await tx.fornecedor.update({
        where: { id: existente.id },
        data: {
          ...(input.tipoPessoa !== undefined
            ? { tipoPessoa: input.tipoPessoa }
            : {}),
          ...(input.codigoErp !== undefined
            ? { codigoErp: input.codigoErp ?? null }
            : {}),
          ...(input.razaoSocial !== undefined
            ? { razaoSocial: input.razaoSocial }
            : {}),
          ...(input.nomeFantasia !== undefined
            ? { nomeFantasia: input.nomeFantasia }
            : {}),
          ...(input.cnpjCpf !== undefined ? { cnpjCpf: input.cnpjCpf } : {}),
          ...(input.inscricaoEstadual !== undefined
            ? { inscricaoEstadual: input.inscricaoEstadual }
            : {}),
          ...(input.inscricaoMunicipal !== undefined
            ? { inscricaoMunicipal: input.inscricaoMunicipal }
            : {}),
          ...(input.contato !== undefined ? { contato: input.contato } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.telefone !== undefined ? { telefone: input.telefone } : {}),
          ...(input.celular !== undefined ? { celular: input.celular } : {}),
          ...(input.endereco !== undefined ? { endereco: input.endereco } : {}),
          ...(input.complemento !== undefined
            ? { complemento: input.complemento }
            : {}),
          ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
          ...(input.municipio !== undefined
            ? { municipio: input.municipio }
            : {}),
          ...(input.uf !== undefined ? { uf: input.uf } : {}),
          ...(input.cep !== undefined ? { cep: input.cep } : {}),
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
        },
      });
      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.fornecedor.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Fornecedor não encontrado');
      await tx.fornecedor.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
