import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import {
  ITEM_DE_VENDA_WHERE,
  NOTA_DE_VENDA_WHERE,
} from '../../common/vendas/venda-analitica';
import type {
  DashboardGerencial,
  DashboardGerencialClientesSemVendedor,
  DashboardGerencialQuery,
  DashboardGerencialVendedor,
  DashboardGerencialVendedorQuery,
  ObjetivoCopiarPeriodo,
  ObjetivoDashboardMunicipiosQuery,
  ObjetivoDashboardQuery,
  ObjetivoVendedorMesCreate,
  ObjetivoVendedorMesQuery,
  ObjetivoVendedorMesUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['ano', 'mes', 'valor', 'ativo', 'createdAt']);

/**
 * Cliente que ninguém está atendendo: sem vendedor no cadastro ou apontando
 * para vendedor inativo/excluído. Mora aqui numa constante só porque o card
 * do Dashboard Gerencial conta e a listagem do card lista — se as duas
 * escrevessem o critério na mão, um dia o número deixaria de bater com a
 * lista que ele abre.
 */
const CLIENTE_SEM_VENDEDOR_ATIVO = {
  OR: [
    { vendedorId: null },
    { vendedor: { is: { ativo: false } } },
    { vendedor: { is: { deletedAt: { not: null } } } },
  ],
};

/** Teto da listagem de clientes sem vendedor — a resposta diz o total real. */
const LIMITE_CLIENTES_SEM_VENDEDOR = 1000;

const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const CATEGORIA_LINHA_INCLUDE = {
  categorias: {
    where: { deletedAt: null },
    include: { categoria: { select: { codigoErp: true, descricao: true } } },
  },
};

@Injectable()
export class ObjetivosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: ObjetivoVendedorMesQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'ano';
      const [data, total] = await Promise.all([
        tx.objetivoVendedorMes.findMany({
          where,
          include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
          ...paginationToSkipTake(query),
          orderBy: [{ [sortField]: query.sortOrder }, { mes: 'desc' }],
        }),
        tx.objetivoVendedorMes.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');
      return objetivo;
    });
  }

  private garantirVendedorNoEscopo(escopo: string[] | null, vendedorId: string) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  private async garantirSemDuplicidade(
    tx: TenantTx,
    empresaId: string,
    vendedorId: string,
    mes: number,
    ano: number,
    ignorarId?: string,
  ) {
    const existente = await tx.objetivoVendedorMes.findFirst({
      where: {
        empresaId,
        vendedorId,
        mes,
        ano,
        deletedAt: null,
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException('Já existe objetivo para este vendedor neste mês/ano');
    }
  }

  create(empresaId: string, user: AuthenticatedUser, input: ObjetivoVendedorMesCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirSemDuplicidade(tx, empresaId, input.vendedorId, input.mes, input.ano);

      const { categorias, tipo, ...header } = input;
      const objetivo = await tx.objetivoVendedorMes.create({
        data: {
          ...header,
          tipo: tipo || null,
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
          categorias: {
            create: categorias.map((c) => ({ ...c, empresaId })),
          },
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
      return objetivo;
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ObjetivoVendedorMesUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');

      const vendedorId = input.vendedorId ?? objetivo.vendedorId;
      const mes = input.mes ?? objetivo.mes;
      const ano = input.ano ?? objetivo.ano;
      if (input.vendedorId) this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirSemDuplicidade(tx, empresaId, vendedorId, mes, ano, id);

      const { categorias, tipo, ...header } = input;
      if (categorias) {
        await tx.objetivoVendedorCategoria.deleteMany({ where: { objetivoVendedorMesId: id } });
      }
      return tx.objetivoVendedorMes.update({
        where: { id },
        data: {
          ...header,
          ...(tipo !== undefined ? { tipo: tipo || null } : {}),
          updatedBy: user.id,
          ...(categorias
            ? { categorias: { create: categorias.map((c) => ({ ...c, empresaId })) } }
            : {}),
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');
      return tx.objetivoVendedorMes.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Copia os objetivos de um mês/ano para outro, aplicando um percentual de
   * reajuste (negativo reduz) sobre os valores em R$ — meta do mês e linhas
   * por categoria, na mesma proporção. Quantidades (nº de clientes, novos
   * clientes) vêm como estão: reajustá-las geraria fração de cliente.
   *
   * Vendedor que já tem objetivo no destino é **pulado**, nunca sobrescrito —
   * o destino costuma ser um mês já em uso, e perder meta digitada seria pior
   * que copiar de menos. O retorno diz quantos e quais ficaram de fora.
   *
   * Respeita o escopo hierárquico: um supervisor copia o período do seu time,
   * não o da empresa inteira.
   */
  copiarPeriodo(
    empresaId: string,
    user: AuthenticatedUser,
    input: ObjetivoCopiarPeriodo,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const fator = 1 + input.percReajuste / 100;
      const ajustar = (valor: number) => Math.round(valor * fator * 100) / 100;

      const origem = await tx.objetivoVendedorMes.findMany({
        where: {
          empresaId,
          mes: input.mesOrigem,
          ano: input.anoOrigem,
          deletedAt: null,
          ...combinarFiltroVendedor(escopo, undefined),
        },
        include: {
          vendedor: { select: { nome: true, nomeReduzido: true } },
          categorias: { where: { deletedAt: null } },
        },
      });
      if (origem.length === 0) {
        throw new NotFoundException(
          `Nenhum objetivo encontrado em ${String(input.mesOrigem).padStart(2, '0')}/${input.anoOrigem}`,
        );
      }

      const jaExistem = await tx.objetivoVendedorMes.findMany({
        where: {
          empresaId,
          mes: input.mesDestino,
          ano: input.anoDestino,
          deletedAt: null,
          vendedorId: { in: origem.map((o) => o.vendedorId) },
        },
        select: { vendedorId: true },
      });
      const ocupados = new Set(jaExistem.map((o) => o.vendedorId));

      const aCopiar = origem.filter((o) => !ocupados.has(o.vendedorId));
      for (const objetivo of aCopiar) {
        await tx.objetivoVendedorMes.create({
          data: {
            empresaId,
            vendedorId: objetivo.vendedorId,
            mes: input.mesDestino,
            ano: input.anoDestino,
            valor: ajustar(objetivo.valor),
            numeroCliente: objetivo.numeroCliente,
            novoCliente: objetivo.novoCliente,
            tipo: objetivo.tipo,
            ativo: objetivo.ativo,
            // codigoLegado fica nulo: a cópia nasce aqui, não veio do ERP.
            createdBy: user.id,
            updatedBy: user.id,
            categorias: {
              create: objetivo.categorias.map((c) => ({
                empresaId,
                categoriaId: c.categoriaId,
                valor: ajustar(c.valor),
                createdBy: user.id,
                updatedBy: user.id,
              })),
            },
          },
        });
      }

      const pulados = origem.filter((o) => ocupados.has(o.vendedorId));
      return {
        copiados: aCopiar.length,
        pulados: pulados.length,
        vendedoresPulados: pulados.map(
          (o) => o.vendedor.nomeReduzido || o.vendedor.nome,
        ),
      };
    });
  }

  /**
   * Dashboard Comercial: objetivo (ObjetivoVendedorMes/Categoria) vs realizado
   * (agregado ao vivo de notas_saida_itens), no escopo hierárquico do usuário
   * combinado com o vendedorId da query (omitido = agrega o escopo inteiro).
   * Realizado por item = vlrTotal − vlrDev (aproximação do vlr_liquido do
   * legado: o campo item-level vlr_bruto do legado não foi importado, só
   * vlr_total, que já é o valor líquido de desconto).
   *
   * O que entra vem de `ITEM_DE_VENDA_WHERE`: até então o realizado somava
   * item de qualquer nota — comodato, devolução e nota sem financeiro
   * inclusive —, o que dava um realizado maior do que o das Consultas para o
   * mesmo mês.
   */
  async dashboard(empresaId: string, user: AuthenticatedUser, query: ObjetivoDashboardQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroVendedor = combinarFiltroVendedor(escopo, query.vendedorId);

      const objetivos = await tx.objetivoVendedorMes.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          mes: query.mes,
          ano: query.ano,
          ...filtroVendedor,
        },
        include: { categorias: { where: { deletedAt: null } } },
      });
      const objetivoValor = objetivos.reduce((acc, o) => acc + o.valor, 0);
      const objetivoClientes = objetivos.reduce((acc, o) => acc + (o.numeroCliente ?? 0), 0);
      const objetivoPorCategoria = new Map<string, number>();
      for (const o of objetivos) {
        for (const c of o.categorias) {
          objetivoPorCategoria.set(
            c.categoriaId,
            (objetivoPorCategoria.get(c.categoriaId) ?? 0) + c.valor,
          );
        }
      }

      // O município vem do cadastro do cliente e recorta o que foi vendido e a
      // base de clientes. O objetivo fica de fora: a meta é por vendedor/mês,
      // não existe meta por município — a tela diz isso ao lado do card.
      const filtroMunicipio = query.municipio
        ? { cliente: { municipio: query.municipio } }
        : {};
      const itensWhere = {
        empresaId,
        ...ITEM_DE_VENDA_WHERE,
        ano: query.ano,
        mes: query.mes,
        ...filtroVendedor,
        ...filtroMunicipio,
      };
      const [gruposPorProduto, clientesPositivadosGrupos, baseTotal] =
        await Promise.all([
          tx.notaSaidaItem.groupBy({
            by: ['produtoId'],
            where: itensWhere,
            _sum: { vlrTotal: true, vlrDev: true },
          }),
          tx.notaSaidaItem.groupBy({
            by: ['clienteId'],
            where: { ...itensWhere, clienteId: { not: null } },
          }),
          tx.cliente.count({
            where: {
              empresaId,
              deletedAt: null,
              ativo: true,
              ...filtroVendedor,
              ...(query.municipio ? { municipio: query.municipio } : {}),
            },
          }),
        ]);

      const produtoIds = gruposPorProduto
        .map((g) => g.produtoId)
        .filter((id): id is string => id !== null);
      const produtos = produtoIds.length
        ? await tx.produto.findMany({
            where: { id: { in: produtoIds } },
            select: { id: true, categoriaId: true },
          })
        : [];
      const categoriaPorProduto = new Map(produtos.map((p) => [p.id, p.categoriaId]));

      let realizadoValor = 0;
      let devolucaoTotal = 0;
      const realizadoPorCategoria = new Map<string, number>();
      for (const g of gruposPorProduto) {
        const total = g._sum.vlrTotal ?? 0;
        const dev = g._sum.vlrDev ?? 0;
        const liquido = total - dev;
        realizadoValor += liquido;
        devolucaoTotal += dev;
        const categoriaId = g.produtoId ? categoriaPorProduto.get(g.produtoId) : null;
        if (categoriaId) {
          realizadoPorCategoria.set(categoriaId, (realizadoPorCategoria.get(categoriaId) ?? 0) + liquido);
        }
      }

      const categoriaIds = new Set([...objetivoPorCategoria.keys(), ...realizadoPorCategoria.keys()]);
      // Só as categorias marcadas como **usadas** entram na tabela (a marcação
      // é de Cadastros > Categorias). São 21 das 29 raízes: o resto é
      // categoria que o ERP carrega mas a empresa não acompanha, e listá-las
      // afundava as que importam.
      //
      // O KPI "Realizado" agora exclui as mesmas categorias recusadas, então
      // os dois números partem da mesma venda. O que ainda pode separá-los é
      // a categoria em branco (nem sim, nem não): ela entra no KPI, porque
      // ninguém disse que não serve, mas não tem linha própria aqui.
      const categoriasInfo = categoriaIds.size
        ? await tx.categoria.findMany({
            where: { id: { in: [...categoriaIds] }, usado: true },
            select: { id: true, codigoErp: true, descricao: true },
          })
        : [];
      const categorias = categoriasInfo
        .map((c) => ({
          categoriaId: c.id,
          codigoErp: c.codigoErp,
          descricao: c.descricao,
          realizado: realizadoPorCategoria.get(c.id) ?? 0,
          objetivo: objetivoPorCategoria.get(c.id) ?? 0,
        }))
        .sort((a, b) => a.codigoErp.localeCompare(b.codigoErp));

      const clientesPositivados = clientesPositivadosGrupos.length;
      const perc = (num: number, den: number) => (den > 0 ? Math.round((num * 10000) / den) / 100 : 0);

      return {
        objetivoValor,
        realizadoValor,
        percRealizado: perc(realizadoValor, objetivoValor),
        objetivoClientes,
        clientesPositivados,
        percClientes: perc(clientesPositivados, objetivoClientes),
        baseTotal,
        percBase: perc(clientesPositivados, baseTotal),
        devolucaoTotal,
        municipio: query.municipio ?? null,
        categorias,
      };
    });
  }

  /**
   * Municípios com venda no período — as opções do filtro de município do
   * Dashboard Comercial. Listar a carteira inteira encheria o select de
   * cidades que deixariam a tela zerada; aqui só entra quem tem movimento no
   * mês/ano (e no vendedor, quando escolhido).
   */
  async municipiosDashboard(
    empresaId: string,
    user: AuthenticatedUser,
    query: ObjetivoDashboardMunicipiosQuery,
  ): Promise<string[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroVendedor = combinarFiltroVendedor(escopo, query.vendedorId);

      const grupos = await tx.notaSaidaItem.groupBy({
        by: ['clienteId'],
        where: {
          empresaId,
          ...ITEM_DE_VENDA_WHERE,
          ano: query.ano,
          mes: query.mes,
          clienteId: { not: null },
          ...filtroVendedor,
        },
      });
      const clienteIds = grupos
        .map((g) => g.clienteId)
        .filter((id): id is string => id !== null);
      if (clienteIds.length === 0) return [];

      const clientes = await tx.cliente.findMany({
        where: { id: { in: clienteIds }, empresaId, municipio: { not: null } },
        select: { municipio: true },
        distinct: ['municipio'],
        orderBy: { municipio: 'asc' },
      });
      return clientes
        .map((c) => c.municipio)
        .filter((m): m is string => !!m && m.trim() !== '');
    });
  }

  /**
   * Dashboard Gerencial: o mesmo mês visto por vendedor — objetivo e
   * realizado, tanto em valor quanto em positivação de clientes.
   *
   * `clientesSemVendedor` conta cliente ativo que ninguém está atendendo: sem
   * vendedor no cadastro **ou** apontando para vendedor inativo/excluído — o
   * segundo caso é o que aparece quando alguém sai da equipe e a carteira não
   * é redistribuída, e some da conta se olharmos só o campo nulo. Só faz
   * sentido para quem enxerga a base inteira: num escopo restrito esses
   * clientes não estão na carteira de ninguém do time, e o número sai zerado
   * em vez de contar gente de fora.
   */
  async dashboardGerencial(
    empresaId: string,
    user: AuthenticatedUser,
    query: DashboardGerencialQuery,
  ): Promise<DashboardGerencial> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroVendedor = combinarFiltroVendedor(escopo, query.vendedorId);

      const itensWhere = {
        empresaId,
        ...ITEM_DE_VENDA_WHERE,
        ano: query.ano,
        mes: query.mes,
        ...filtroVendedor,
      };

      const [
        objetivos,
        porVendedor,
        positivacaoGrupos,
        baseTotal,
        clientesSemVendedor,
        totalNotas,
      ] = await Promise.all([
        tx.objetivoVendedorMes.findMany({
          where: {
            empresaId,
            deletedAt: null,
            ativo: true,
            mes: query.mes,
            ano: query.ano,
            ...filtroVendedor,
          },
          select: { vendedorId: true, valor: true, numeroCliente: true },
        }),
        tx.notaSaidaItem.groupBy({
          by: ['vendedorId'],
          where: itensWhere,
          _sum: { vlrTotal: true, vlrDev: true },
        }),
        // Um par (vendedor, cliente) por linha: a contagem de clientes
        // distintos de cada vendedor sai do tamanho de cada grupo.
        tx.notaSaidaItem.groupBy({
          by: ['vendedorId', 'clienteId'],
          where: { ...itensWhere, clienteId: { not: null } },
        }),
        tx.cliente.count({
          where: { empresaId, deletedAt: null, ativo: true, ...filtroVendedor },
        }),
        escopo === null
          ? tx.cliente.count({
              where: {
                empresaId,
                deletedAt: null,
                ativo: true,
                ...CLIENTE_SEM_VENDEDOR_ATIVO,
              },
            })
          : Promise.resolve(0),
        tx.notaSaida.count({
          where: {
            empresaId,
            ...NOTA_DE_VENDA_WHERE,
            ano: query.ano,
            mes: query.mes,
            ...filtroVendedor,
          },
        }),
      ]);

      const objetivoPorVendedor = new Map<
        string,
        { valor: number; clientes: number }
      >();
      for (const o of objetivos) {
        const atual = objetivoPorVendedor.get(o.vendedorId) ?? {
          valor: 0,
          clientes: 0,
        };
        atual.valor += o.valor;
        atual.clientes += o.numeroCliente ?? 0;
        objetivoPorVendedor.set(o.vendedorId, atual);
      }

      const realizadoPorVendedor = new Map<string, number>();
      let devolucao = 0;
      for (const g of porVendedor) {
        if (!g.vendedorId) continue;
        const liquido = (g._sum.vlrTotal ?? 0) - (g._sum.vlrDev ?? 0);
        realizadoPorVendedor.set(
          g.vendedorId,
          (realizadoPorVendedor.get(g.vendedorId) ?? 0) + liquido,
        );
        devolucao += g._sum.vlrDev ?? 0;
      }

      const positivacaoPorVendedor = new Map<string, number>();
      const clientesDistintos = new Set<string>();
      for (const g of positivacaoGrupos) {
        if (g.clienteId) clientesDistintos.add(g.clienteId);
        if (!g.vendedorId) continue;
        positivacaoPorVendedor.set(
          g.vendedorId,
          (positivacaoPorVendedor.get(g.vendedorId) ?? 0) + 1,
        );
      }

      // Entra na tabela quem tem meta ou movimento no período — vendedor sem
      // nenhum dos dois não tem o que acompanhar.
      const vendedorIds = [
        ...new Set([
          ...objetivoPorVendedor.keys(),
          ...realizadoPorVendedor.keys(),
          ...positivacaoPorVendedor.keys(),
        ]),
      ];
      const vendedores = vendedorIds.length
        ? await tx.vendedor.findMany({
            where: { id: { in: vendedorIds }, empresaId, deletedAt: null },
            select: { id: true, nome: true, nomeReduzido: true },
          })
        : [];

      const perc = (num: number, den: number) =>
        den > 0 ? Math.round((num * 10000) / den) / 100 : 0;
      const linhas = vendedores
        .map((v) => {
          const metaVendedor = objetivoPorVendedor.get(v.id);
          const objetivo = metaVendedor?.valor ?? 0;
          const realizado =
            Math.round((realizadoPorVendedor.get(v.id) ?? 0) * 100) / 100;
          const positivacaoObjetivo = metaVendedor?.clientes ?? 0;
          const positivacaoRealizado = positivacaoPorVendedor.get(v.id) ?? 0;
          return {
            vendedorId: v.id,
            nome: v.nomeReduzido || v.nome,
            positivacaoObjetivo,
            positivacaoRealizado,
            percPositivacao: perc(positivacaoRealizado, positivacaoObjetivo),
            objetivo,
            realizado,
            percRealizado: perc(realizado, objetivo),
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      const realizado =
        Math.round(
          [...realizadoPorVendedor.values()].reduce((a, b) => a + b, 0) * 100,
        ) / 100;
      const objetivo = [...objetivoPorVendedor.values()].reduce(
        (acc, o) => acc + o.valor,
        0,
      );
      const objetivoClientes = [...objetivoPorVendedor.values()].reduce(
        (acc, o) => acc + o.clientes,
        0,
      );
      const clientesPositivados = clientesDistintos.size;

      return {
        periodo: {
          mes: query.mes,
          ano: query.ano,
          label: `${String(query.mes).padStart(2, '0')}/${query.ano}`,
        },
        resumo: {
          realizado,
          objetivo,
          percRealizado: perc(realizado, objetivo),
          clientesPositivados,
          objetivoClientes,
          percClientes: perc(clientesPositivados, objetivoClientes),
          devolucao: Math.round(devolucao * 100) / 100,
          baseTotal,
          percBase: perc(clientesPositivados, baseTotal),
          clientesSemVendedor,
          totalNotas,
          ticketMedio:
            totalNotas > 0
              ? Math.round((realizado / totalNotas) * 100) / 100
              : 0,
        },
        linhas,
      };
    });
  }

  /**
   * Detalhe de uma linha do Dashboard Gerencial: o mês daquele vendedor
   * repartido por categoria de produto.
   *
   * O vendedor passa pelo mesmo `combinarFiltroVendedor` da listagem — pedir
   * o id de alguém fora do escopo devolve tudo zerado, não a carteira do
   * outro. Categoria só com meta e categoria só com venda entram as duas.
   */
  async dashboardGerencialVendedor(
    empresaId: string,
    user: AuthenticatedUser,
    vendedorId: string,
    query: DashboardGerencialVendedorQuery,
  ): Promise<DashboardGerencialVendedor> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroVendedor = combinarFiltroVendedor(escopo, vendedorId);
      const noEscopo = escopo === null || escopo.includes(vendedorId);

      const vendedor = noEscopo
        ? await tx.vendedor.findFirst({
            where: { id: vendedorId, empresaId, deletedAt: null },
            select: { id: true, nome: true, nomeReduzido: true },
          })
        : null;
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

      const [objetivos, gruposPorProduto] = await Promise.all([
        tx.objetivoVendedorMes.findMany({
          where: {
            empresaId,
            deletedAt: null,
            ativo: true,
            mes: query.mes,
            ano: query.ano,
            ...filtroVendedor,
          },
          include: { categorias: { where: { deletedAt: null } } },
        }),
        tx.notaSaidaItem.groupBy({
          by: ['produtoId'],
          where: {
            empresaId,
            ...ITEM_DE_VENDA_WHERE,
            ano: query.ano,
            mes: query.mes,
            ...filtroVendedor,
          },
          _sum: { vlrTotal: true, vlrDev: true },
        }),
      ]);

      const objetivo = objetivos.reduce((acc, o) => acc + o.valor, 0);
      const objetivoPorCategoria = new Map<string, number>();
      for (const o of objetivos) {
        for (const c of o.categorias) {
          objetivoPorCategoria.set(
            c.categoriaId,
            (objetivoPorCategoria.get(c.categoriaId) ?? 0) + c.valor,
          );
        }
      }

      const produtoIds = gruposPorProduto
        .map((g) => g.produtoId)
        .filter((id): id is string => id !== null);
      const produtos = produtoIds.length
        ? await tx.produto.findMany({
            where: { id: { in: produtoIds } },
            select: { id: true, categoriaId: true },
          })
        : [];
      const categoriaPorProduto = new Map(
        produtos.map((p) => [p.id, p.categoriaId]),
      );

      let realizado = 0;
      let realizadoSemCategoria = 0;
      const realizadoPorCategoria = new Map<string, number>();
      for (const g of gruposPorProduto) {
        const liquido = (g._sum.vlrTotal ?? 0) - (g._sum.vlrDev ?? 0);
        realizado += liquido;
        const categoriaId = g.produtoId
          ? categoriaPorProduto.get(g.produtoId)
          : null;
        if (categoriaId) {
          realizadoPorCategoria.set(
            categoriaId,
            (realizadoPorCategoria.get(categoriaId) ?? 0) + liquido,
          );
        } else {
          realizadoSemCategoria += liquido;
        }
      }

      const categoriaIds = new Set([
        ...objetivoPorCategoria.keys(),
        ...realizadoPorCategoria.keys(),
      ]);
      const categoriasInfo = categoriaIds.size
        ? await tx.categoria.findMany({
            where: { id: { in: [...categoriaIds] } },
            select: { id: true, codigoErp: true, descricao: true },
          })
        : [];

      const arredondar = (v: number) => Math.round(v * 100) / 100;
      const perc = (num: number, den: number) =>
        den > 0 ? Math.round((num * 10000) / den) / 100 : 0;

      const categorias = categoriasInfo
        .map((c) => {
          const objetivoCategoria = objetivoPorCategoria.get(c.id) ?? 0;
          const realizadoCategoria = arredondar(
            realizadoPorCategoria.get(c.id) ?? 0,
          );
          return {
            categoriaId: c.id,
            codigoErp: c.codigoErp,
            descricao: c.descricao,
            objetivo: objetivoCategoria,
            realizado: realizadoCategoria,
            percRealizado: perc(realizadoCategoria, objetivoCategoria),
          };
        })
        .sort((a, b) => a.codigoErp.localeCompare(b.codigoErp));

      return {
        vendedorId: vendedor.id,
        nome: vendedor.nomeReduzido || vendedor.nome,
        periodo: {
          mes: query.mes,
          ano: query.ano,
          label: `${String(query.mes).padStart(2, '0')}/${query.ano}`,
        },
        objetivo,
        realizado: arredondar(realizado),
        percRealizado: perc(arredondar(realizado), objetivo),
        categorias,
        realizadoSemCategoria: arredondar(realizadoSemCategoria),
      };
    });
  }

  /**
   * Quem são os clientes contados no card "Clientes sem vendedor ativo".
   *
   * Segue a mesma regra de visibilidade do card: num escopo restrito esses
   * clientes não estão na carteira de ninguém do time, o card mostra zero e
   * aqui a lista sai vazia — não é a lista de outra pessoa para conferir.
   *
   * A data exibida é a mais recente entre `cliente.ultimaCompra` (histórico
   * vindo do import) e a última nota na base: nos dados de hoje há cliente
   * com uma e não a outra, e o que o gestor quer saber é há quanto tempo
   * aquele cliente não compra, venha o dado de onde vier.
   */
  async clientesSemVendedor(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<DashboardGerencialClientesSemVendedor> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      if (escopo !== null) {
        return { total: 0, limite: LIMITE_CLIENTES_SEM_VENDEDOR, linhas: [] };
      }

      const where = {
        empresaId,
        deletedAt: null,
        ativo: true,
        ...CLIENTE_SEM_VENDEDOR_ATIVO,
      };
      const [total, clientes] = await Promise.all([
        tx.cliente.count({ where }),
        tx.cliente.findMany({
          where,
          select: {
            id: true,
            codigoErp: true,
            razaoSocial: true,
            cnpjCpf: true,
            ultimaCompra: true,
          },
          orderBy: { razaoSocial: 'asc' },
          take: LIMITE_CLIENTES_SEM_VENDEDOR,
        }),
      ]);

      const notas = clientes.length
        ? await tx.notaSaida.groupBy({
            by: ['clienteId'],
            where: {
              empresaId,
              ...NOTA_DE_VENDA_WHERE,
              clienteId: { in: clientes.map((c) => c.id) },
            },
            _max: { dtEmissao: true },
          })
        : [];
      const ultimaNotaPorCliente = new Map<string, Date>();
      for (const n of notas) {
        if (n.clienteId && n._max.dtEmissao) {
          ultimaNotaPorCliente.set(n.clienteId, n._max.dtEmissao);
        }
      }

      const linhas = clientes
        .map((c) => {
          const ultimaNota = ultimaNotaPorCliente.get(c.id) ?? null;
          const maisRecente =
            c.ultimaCompra && ultimaNota
              ? c.ultimaCompra > ultimaNota
                ? c.ultimaCompra
                : ultimaNota
              : (c.ultimaCompra ?? ultimaNota);
          return {
            clienteId: c.id,
            codigo: c.codigoErp,
            nome: c.razaoSocial,
            cnpjCpf: c.cnpjCpf,
            ultimaCompra: maisRecente ? maisRecente.toISOString() : null,
          };
        })
        // Quem comprou mais recentemente primeiro: é o cliente ativo que está
        // sem dono agora. Sem compra nenhuma vai para o fim da lista.
        .sort((a, b) => (b.ultimaCompra ?? '').localeCompare(a.ultimaCompra ?? ''));

      return { total, limite: LIMITE_CLIENTES_SEM_VENDEDOR, linhas };
    });
  }
}
