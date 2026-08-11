import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type {
  BaseVendedor,
  ConsultaVendasClienteQuery,
  ConsultaVendasLinha,
  ConsultaVendasProdutoQuery,
  ConsultaVendasResultado,
} from '@plataforma/contracts';
import { PARAMETRO_BASE_VENDEDOR } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ParametrosService } from '../parametros/parametros.service';

/** Linha crua do banco: uma por (entidade, mês). O pivô é feito aqui. */
interface LinhaAgregada {
  id: string;
  codigo: string | null;
  descricao: string;
  mes: number;
  valor: number;
}

/**
 * Consultas gerenciais de venda. Duas características valem o SQL bruto:
 * a agregação por mês (o query builder não pivota) e o fato de o campo do
 * vendedor variar conforme o parâmetro da empresa.
 *
 * Base: nota ATIVA e não-comodato, a mesma regra da Posição de Cliente —
 * comodato é remessa, e nota inativa é cancelamento no ERP.
 */
@Injectable()
export class ConsultasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /**
   * `nota` (padrão) credita a venda a quem a fez; `cliente`, ao titular da
   * carteira. Configurável em Administração > Parâmetros, sem deploy.
   */
  private async baseVendedor(
    empresaId: string,
    tx: TenantTx,
  ): Promise<BaseVendedor> {
    const valor = await this.parametros.obterTexto(
      empresaId,
      PARAMETRO_BASE_VENDEDOR,
      'nota',
      tx,
    );
    return valor === 'cliente' ? 'cliente' : 'nota';
  }

  /**
   * Restrição de carteira + filtro de vendedor da tela, aplicados sobre a
   * coluna que a base escolhida define. Um vendedorId fora do escopo zera o
   * resultado em vez de vazar carteira de fora do time (mesma regra de
   * combinarFiltroVendedor).
   */
  private condicaoVendedor(
    coluna: Prisma.Sql,
    escopo: string[] | null,
    vendedorId?: string,
  ): Prisma.Sql[] {
    const condicoes: Prisma.Sql[] = [];
    if (escopo !== null) {
      condicoes.push(
        escopo.length > 0
          ? Prisma.sql`${coluna} IN (${Prisma.join(escopo)})`
          : Prisma.sql`false`,
      );
    }
    if (vendedorId) {
      const permitido = escopo === null || escopo.includes(vendedorId);
      condicoes.push(
        permitido ? Prisma.sql`${coluna} = ${vendedorId}` : Prisma.sql`false`,
      );
    }
    return condicoes;
  }

  /** Pivota as linhas (entidade, mês) em uma linha por entidade com 12 meses. */
  private pivotar(agregadas: LinhaAgregada[]): {
    linhas: ConsultaVendasLinha[];
    totaisMes: number[];
    total: number;
  } {
    const porEntidade = new Map<string, ConsultaVendasLinha>();
    const totaisMes = Array<number>(12).fill(0);

    for (const linha of agregadas) {
      let atual = porEntidade.get(linha.id);
      if (!atual) {
        atual = {
          id: linha.id,
          codigo: linha.codigo,
          descricao: linha.descricao,
          meses: Array<number>(12).fill(0),
          total: 0,
        };
        porEntidade.set(linha.id, atual);
      }
      // mes vem 1..12 do ERP; posição 0 do array é janeiro.
      const indice = linha.mes - 1;
      if (indice < 0 || indice > 11) continue;
      const valor = Number(linha.valor);
      atual.meses[indice] += valor;
      atual.total += valor;
      totaisMes[indice] += valor;
    }

    const linhas = [...porEntidade.values()].sort((a, b) => b.total - a.total);
    return {
      linhas,
      totaisMes,
      total: totaisMes.reduce((acc, v) => acc + v, 0),
    };
  }

  private async vendedorRef(tx: TenantTx, empresaId: string, id?: string) {
    if (!id) return null;
    const v = await tx.vendedor.findFirst({
      where: { id, empresaId, deletedAt: null },
      select: { id: true, nome: true, nomeReduzido: true },
    });
    return v ? { id: v.id, nome: v.nomeReduzido || v.nome } : null;
  }

  /**
   * Vendas do ano por cliente, mês a mês. Valor = vlrBruto da nota (mesmo
   * número do "Total comprado" da Posição de Cliente).
   */
  async vendasPorCliente(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaVendasClienteQuery,
  ): Promise<ConsultaVendasResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const base = await this.baseVendedor(empresaId, tx);
      const colunaVendedor =
        base === 'cliente'
          ? Prisma.sql`c."vendedorId"`
          : Prisma.sql`n."vendedorId"`;

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`n."empresaId" = ${empresaId}`,
        Prisma.sql`n."deletedAt" IS NULL`,
        Prisma.sql`n."ativo" = true`,
        Prisma.sql`n."comodato" = false`,
        Prisma.sql`n."ano" = ${query.ano}`,
        ...this.condicaoVendedor(colunaVendedor, escopo, query.vendedorId),
      ];

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          c."id"          AS "id",
          c."codigoErp"   AS "codigo",
          c."razaoSocial" AS "descricao",
          n."mes"         AS "mes",
          SUM(n."vlrBruto")::float8 AS "valor"
        FROM "notas_saida" n
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY c."id", c."codigoErp", c."razaoSocial", n."mes"
      `);

      return {
        ano: query.ano,
        baseVendedor: base,
        vendedor: await this.vendedorRef(tx, empresaId, query.vendedorId),
        categoria: null,
        ...this.pivotar(agregadas),
      };
    });
  }

  /**
   * Vendas do ano por produto, mês a mês. Valor = vlrTotal do item (frete e
   * impostos do cabeçalho não são rateados por item).
   */
  async vendasPorProduto(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaVendasProdutoQuery,
  ): Promise<ConsultaVendasResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const base = await this.baseVendedor(empresaId, tx);
      const colunaVendedor =
        base === 'cliente'
          ? Prisma.sql`cli."vendedorId"`
          : Prisma.sql`i."vendedorId"`;

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`i."empresaId" = ${empresaId}`,
        Prisma.sql`i."deletedAt" IS NULL`,
        Prisma.sql`i."ativo" = true`,
        Prisma.sql`i."ano" = ${query.ano}`,
        // O cabeçalho manda no que é venda: item de nota cancelada ou de
        // remessa de comodato não entra.
        Prisma.sql`n."deletedAt" IS NULL`,
        Prisma.sql`n."ativo" = true`,
        Prisma.sql`n."comodato" = false`,
        ...this.condicaoVendedor(colunaVendedor, escopo, query.vendedorId),
      ];
      if (query.categoriaId) {
        condicoes.push(Prisma.sql`p."categoriaId" = ${query.categoriaId}`);
      }

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          p."id"        AS "id",
          p."codigoErp" AS "codigo",
          p."descricao" AS "descricao",
          i."mes"       AS "mes",
          SUM(i."vlrTotal")::float8 AS "valor"
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
        JOIN "produtos" p ON p."id" = i."produtoId" AND p."deletedAt" IS NULL
        LEFT JOIN "clientes" cli ON cli."id" = i."clienteId"
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY p."id", p."codigoErp", p."descricao", i."mes"
      `);

      const categoria = query.categoriaId
        ? await tx.categoria.findFirst({
            where: { id: query.categoriaId, empresaId, deletedAt: null },
            select: { id: true, descricao: true },
          })
        : null;

      return {
        ano: query.ano,
        baseVendedor: base,
        vendedor: await this.vendedorRef(tx, empresaId, query.vendedorId),
        categoria,
        ...this.pivotar(agregadas),
      };
    });
  }
}
