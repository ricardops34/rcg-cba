import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoCliente,
  IntegracaoClienteCreate,
  IntegracaoClienteQuery,
  IntegracaoClienteUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';

const INCLUDE = {
  vendedor: { select: { codigoErp: true } },
  tabelaPreco: { select: { codigoErp: true } },
  condicaoPagamento: { select: { codigoErp: true } },
} satisfies Prisma.ClienteInclude;
type ClienteComRelacoes = Prisma.ClienteGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoClientesService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: ClienteComRelacoes): IntegracaoCliente {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      tipoPessoa: row.tipoPessoa,
      razaoSocial: row.razaoSocial,
      nomeFantasia: row.nomeFantasia,
      cnpjCpf: row.cnpjCpf,
      inscricaoEstadual: row.inscricaoEstadual,
      inscricaoMunicipal: row.inscricaoMunicipal,
      contribuinteIcms: row.contribuinteIcms,
      rg: row.rg,
      dataNascimento: row.dataNascimento,
      contato: row.contato,
      email: row.email,
      telefone: row.telefone,
      telefone2: row.telefone2,
      celular: row.celular,
      endereco: row.endereco,
      complemento: row.complemento,
      bairro: row.bairro,
      municipio: row.municipio,
      uf: row.uf,
      cep: row.cep,
      latitude: row.latitude,
      longitude: row.longitude,
      vendedorCodigo: row.vendedor?.codigoErp ?? null,
      tabelaPrecoCodigo: row.tabelaPreco?.codigoErp ?? null,
      condicaoPagamentoCodigo: row.condicaoPagamento?.codigoErp ?? null,
      ativo: row.ativo,
      carteira: row.carteira,
      site: row.site,
      limiteCredito: row.limiteCredito,
      vencimentoLimite: row.vencimentoLimite,
      observacao: row.observacao,
      dataBloqueio: row.dataBloqueio,
      observacaoBloqueio: row.observacaoBloqueio,
      dataReativacao: row.dataReativacao,
      observacaoReativacao: row.observacaoReativacao,
      primeiraCompra: row.primeiraCompra,
      ultimaVisita: row.ultimaVisita,
      ultimaCompra: row.ultimaCompra,
      ultimoAtendimento: row.ultimoAtendimento,
      dataConsultaRfb: row.dataConsultaRfb,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoClienteQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              razaoSocial: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.cliente.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { razaoSocial: 'asc' },
        }),
        tx.cliente.count({ where }),
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
  ): Promise<IntegracaoCliente> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.cliente.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Cliente não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoClienteCreate,
  ): Promise<IntegracaoCliente> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.cliente.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      if (existente)
        throw new ConflictException(
          `Já existe cliente com codigoErp '${input.codigoErp}'`,
        );

      const vendedorId = await this.resolverVendedor(
        tx,
        empresaId,
        input.vendedorCodigo,
      );
      const tabelaPrecoId = await this.resolverTabelaPreco(
        tx,
        empresaId,
        input.tabelaPrecoCodigo,
      );
      const condicaoPagamentoId = await this.resolverCondicaoPagamento(
        tx,
        empresaId,
        input.condicaoPagamentoCodigo,
      );

      const criado = await tx.cliente.create({
        data: {
          empresaId,
          codigoErp: input.codigoErp,
          tipoPessoa: input.tipoPessoa,
          razaoSocial: input.razaoSocial,
          nomeFantasia: input.nomeFantasia ?? null,
          cnpjCpf: input.cnpjCpf ?? null,
          inscricaoEstadual: input.inscricaoEstadual ?? null,
          inscricaoMunicipal: input.inscricaoMunicipal ?? null,
          contribuinteIcms: input.contribuinteIcms ?? null,
          rg: input.rg ?? null,
          dataNascimento: input.dataNascimento ?? null,
          contato: input.contato ?? null,
          email: input.email ?? null,
          telefone: input.telefone ?? null,
          telefone2: input.telefone2 ?? null,
          celular: input.celular ?? null,
          endereco: input.endereco ?? null,
          complemento: input.complemento ?? null,
          bairro: input.bairro ?? null,
          municipio: input.municipio ?? null,
          uf: input.uf ?? null,
          cep: input.cep ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          vendedorId,
          tabelaPrecoId,
          condicaoPagamentoId,
          ativo: input.ativo,
          carteira: input.carteira ?? null,
          site: input.site ?? null,
          limiteCredito: input.limiteCredito ?? null,
          vencimentoLimite: input.vencimentoLimite ?? null,
          observacao: input.observacao ?? null,
          dataBloqueio: input.dataBloqueio ?? null,
          observacaoBloqueio: input.observacaoBloqueio ?? null,
          dataReativacao: input.dataReativacao ?? null,
          observacaoReativacao: input.observacaoReativacao ?? null,
          primeiraCompra: input.primeiraCompra ?? null,
          ultimaVisita: input.ultimaVisita ?? null,
          ultimaCompra: input.ultimaCompra ?? null,
          ultimoAtendimento: input.ultimoAtendimento ?? null,
          dataConsultaRfb: input.dataConsultaRfb ?? null,
          createdBy: autor,
          updatedBy: autor,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoClienteUpdate,
  ): Promise<IntegracaoCliente> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.cliente.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Cliente não encontrado');

      const vendedorId =
        input.vendedorCodigo !== undefined
          ? await this.resolverVendedor(tx, empresaId, input.vendedorCodigo)
          : undefined;
      const tabelaPrecoId =
        input.tabelaPrecoCodigo !== undefined
          ? await this.resolverTabelaPreco(
              tx,
              empresaId,
              input.tabelaPrecoCodigo,
            )
          : undefined;
      const condicaoPagamentoId =
        input.condicaoPagamentoCodigo !== undefined
          ? await this.resolverCondicaoPagamento(
              tx,
              empresaId,
              input.condicaoPagamentoCodigo,
            )
          : undefined;

      const camposDiretos = [
        'tipoPessoa',
        'razaoSocial',
        'nomeFantasia',
        'cnpjCpf',
        'inscricaoEstadual',
        'inscricaoMunicipal',
        'contribuinteIcms',
        'rg',
        'dataNascimento',
        'contato',
        'email',
        'telefone',
        'telefone2',
        'celular',
        'endereco',
        'complemento',
        'bairro',
        'municipio',
        'uf',
        'cep',
        'latitude',
        'longitude',
        'ativo',
        'carteira',
        'site',
        'limiteCredito',
        'vencimentoLimite',
        'observacao',
        'dataBloqueio',
        'observacaoBloqueio',
        'dataReativacao',
        'observacaoReativacao',
        'primeiraCompra',
        'ultimaVisita',
        'ultimaCompra',
        'ultimoAtendimento',
        'dataConsultaRfb',
      ] as const;
      const data: Record<string, unknown> = { updatedBy: autor };
      for (const campo of camposDiretos) {
        if (input[campo] !== undefined) data[campo] = input[campo];
      }
      if (vendedorId !== undefined) data.vendedorId = vendedorId;
      if (tabelaPrecoId !== undefined) data.tabelaPrecoId = tabelaPrecoId;
      if (condicaoPagamentoId !== undefined)
        data.condicaoPagamentoId = condicaoPagamentoId;

      const atualizado = await tx.cliente.update({
        where: { id: existente.id },
        data: data as never,
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
      const existente = await tx.cliente.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Cliente não encontrado');
      await tx.cliente.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverVendedor(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const vendedor = await tx.vendedor.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!vendedor)
      throw new NotFoundException(`vendedorCodigo '${codigo}' não encontrado`);
    return vendedor.id;
  }

  private async resolverTabelaPreco(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const tabela = await tx.tabelaPreco.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!tabela)
      throw new NotFoundException(
        `tabelaPrecoCodigo '${codigo}' não encontrado`,
      );
    return tabela.id;
  }

  private async resolverCondicaoPagamento(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const condicao = await tx.condicaoPagamento.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!condicao)
      throw new NotFoundException(
        `condicaoPagamentoCodigo '${codigo}' não encontrado`,
      );
    return condicao.id;
  }
}
