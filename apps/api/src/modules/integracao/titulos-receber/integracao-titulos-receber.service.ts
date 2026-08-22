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
  IntegracaoTituloReceber,
  IntegracaoTituloReceberCreate,
  IntegracaoTituloReceberQuery,
  IntegracaoTituloReceberUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';

const INCLUDE = {
  cliente: { select: { codigoErp: true } },
  vendedor: { select: { codigoErp: true } },
  // A conta de cobrança volta pela descrição, que é como o ERP a referencia —
  // ele não conhece o uuid do cadastro da plataforma.
  contaBancaria: { select: { descricao: true } },
} satisfies Prisma.TituloReceberInclude;
type TituloComRelacoes = Prisma.TituloReceberGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoTitulosReceberService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: TituloComRelacoes): IntegracaoTituloReceber {
    return {
      id: row.id,
      codigoLegado: row.codigoLegado ?? 0,
      clienteCodigo: row.cliente?.codigoErp ?? null,
      vendedorCodigo: row.vendedor?.codigoErp ?? null,
      numero: row.numero,
      parcela: row.parcela,
      prefixo: row.prefixo,
      tipo: row.tipo,
      emissao: row.emissao,
      vencimento: row.vencimento,
      vencimentoReal: row.vencimentoReal,
      valor: row.valor,
      saldo: row.saldo,
      acrescimo: row.acrescimo,
      decrescimo: row.decrescimo,
      dtBaixa: row.dtBaixa,
      formaPgto: row.formaPgto,
      historico: row.historico,
      ativo: row.ativo,
      nossoNumero: row.nossoNumero,
      carteira: row.carteira,
      contaBancariaDescricao: row.contaBancaria?.descricao ?? null,
      codigoBarras: row.codigoBarras,
      linhaDigitavel: row.linhaDigitavel,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoTituloReceberQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? { numero: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.tituloReceber.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoLegado: 'asc' },
        }),
        tx.tituloReceber.count({ where }),
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
    codigoLegado: number,
  ): Promise<IntegracaoTituloReceber> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.tituloReceber.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Título a receber não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoTituloReceberCreate,
  ): Promise<IntegracaoTituloReceber> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, codigoLegado: input.codigoLegado },
      });
      if (existente) {
        throw new ConflictException(
          `Já existe título com codigoLegado '${input.codigoLegado}'`,
        );
      }

      const clienteId = await this.resolverCliente(
        tx,
        empresaId,
        input.clienteCodigo,
      );
      const vendedorId = await this.resolverVendedor(
        tx,
        empresaId,
        input.vendedorCodigo,
      );
      const contaBancariaId = await this.resolverContaBancaria(
        tx,
        empresaId,
        input.contaBancariaDescricao,
      );

      const criado = await tx.tituloReceber.create({
        data: {
          empresaId,
          codigoLegado: input.codigoLegado,
          clienteId,
          vendedorId,
          numero: input.numero,
          parcela: input.parcela ?? null,
          prefixo: input.prefixo ?? null,
          tipo: input.tipo ?? null,
          emissao: input.emissao ?? null,
          vencimento: input.vencimento ?? null,
          vencimentoReal: input.vencimentoReal ?? null,
          valor: input.valor,
          saldo: input.saldo,
          acrescimo: input.acrescimo ?? null,
          decrescimo: input.decrescimo ?? null,
          dtBaixa: input.dtBaixa ?? null,
          formaPgto: input.formaPgto ?? null,
          historico: input.historico ?? null,
          ativo: input.ativo,
          contaBancariaId,
          nossoNumero: this.soDigitos(input.nossoNumero),
          carteira: this.soDigitos(input.carteira),
          codigoBarras: this.validarCodigoBarras(input.codigoBarras),
          linhaDigitavel: this.soDigitos(input.linhaDigitavel),
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
    codigoLegado: number,
    input: IntegracaoTituloReceberUpdate,
  ): Promise<IntegracaoTituloReceber> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Título a receber não encontrado');

      const clienteId =
        input.clienteCodigo !== undefined
          ? await this.resolverCliente(tx, empresaId, input.clienteCodigo)
          : undefined;
      const vendedorId =
        input.vendedorCodigo !== undefined
          ? await this.resolverVendedor(tx, empresaId, input.vendedorCodigo)
          : undefined;
      const contaBancariaId =
        input.contaBancariaDescricao !== undefined
          ? await this.resolverContaBancaria(
              tx,
              empresaId,
              input.contaBancariaDescricao,
            )
          : undefined;

      const camposDiretos = [
        'numero',
        'parcela',
        'prefixo',
        'tipo',
        'emissao',
        'vencimento',
        'vencimentoReal',
        'valor',
        'saldo',
        'acrescimo',
        'decrescimo',
        'dtBaixa',
        'formaPgto',
        'historico',
        'ativo',
      ] as const;
      const data: Record<string, unknown> = { updatedBy: autor };
      for (const campo of camposDiretos) {
        if (input[campo] !== undefined) data[campo] = input[campo];
      }
      if (clienteId !== undefined) data.clienteId = clienteId;
      if (vendedorId !== undefined) data.vendedorId = vendedorId;
      if (contaBancariaId !== undefined) data.contaBancariaId = contaBancariaId;

      // Os campos de cobrança são normalizados antes de gravar (só dígitos, e
      // o código de barras conferido no tamanho): é o que a geração do boleto
      // vai consumir sem revalidar, e máscara vinda do ERP viraria boleto
      // ilegível.
      if (input.nossoNumero !== undefined)
        data.nossoNumero = this.soDigitos(input.nossoNumero);
      if (input.carteira !== undefined)
        data.carteira = this.soDigitos(input.carteira);
      if (input.codigoBarras !== undefined)
        data.codigoBarras = this.validarCodigoBarras(input.codigoBarras);
      if (input.linhaDigitavel !== undefined)
        data.linhaDigitavel = this.soDigitos(input.linhaDigitavel);

      const atualizado = await tx.tituloReceber.update({
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
    codigoLegado: number,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Título a receber não encontrado');
      await tx.tituloReceber.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCliente(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const cliente = await tx.cliente.findFirst({
      where: { empresaId, codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!cliente)
      throw new NotFoundException(`clienteCodigo '${codigo}' não encontrado`);
    return cliente.id;
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

  /**
   * Conta de cobrança pela descrição cadastrada — o ERP não conhece o uuid.
   *
   * Falhar com 404 quando a descrição não bate é proposital: aceitar em
   * silêncio deixaria o título apontando para a conta padrão, e a 2ª via sairia
   * com o convênio errado — um boleto que o banco não reconhece.
   */
  private async resolverContaBancaria(
    tx: TenantTx,
    empresaId: string,
    descricao: string | null | undefined,
  ) {
    if (!descricao) return null;
    const conta = await tx.contaBancaria.findFirst({
      where: { empresaId, descricao, deletedAt: null },
      select: { id: true },
    });
    if (!conta) {
      throw new NotFoundException(
        `contaBancariaDescricao '${descricao}' não encontrada no cadastro de contas bancárias`,
      );
    }
    return conta.id;
  }

  /** Máscara do ERP não entra no banco: o boleto consome dígito puro. */
  private soDigitos(valor: string | null | undefined) {
    if (valor == null) return null;
    const digitos = valor.replace(/\D/g, '');
    return digitos.length > 0 ? digitos : null;
  }

  /**
   * Código de barras registrado: 44 dígitos ou nada.
   *
   * Guardar um valor truncado seria pior do que não guardar — a plataforma
   * prefere o valor do ERP ao próprio cálculo, então um código inválido
   * silenciaria o cálculo correto e imprimiria lixo.
   */
  private validarCodigoBarras(valor: string | null | undefined) {
    const digitos = this.soDigitos(valor);
    if (!digitos) return null;
    if (digitos.length !== 44) {
      throw new ConflictException(
        `codigoBarras deve ter 44 dígitos (recebido: ${digitos.length})`,
      );
    }
    return digitos;
  }
}
