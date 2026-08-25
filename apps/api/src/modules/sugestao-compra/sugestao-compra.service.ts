import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { ParametrosService } from '../parametros/parametros.service';
import { PESO_NIVEL_CNAE } from '@plataforma/contracts';
import type {
  ClienteSemelhante,
  ProdutoSugerido,
  SugestaoCompraQuery,
  SugestaoCompraResultado,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * O que conta como venda — a mesma definição das Consultas e da Posição de
 * Cliente: nota ativa, fora de comodato e do tipo Normal. Devolução e remessa
 * não são compra e não podem virar sinal de afinidade.
 */
const NOTA_DE_VENDA = Prisma.sql`n."deletedAt" IS NULL AND n."ativo" = true AND n."comodato" = false AND n."tipo" = 'N'`;

/**
 * Tradução do nível numérico que a query devolve (`MAX(nivel)`, do mais
 * próximo ao mais distante) para o nome do parentesco. Precisa ser número no
 * SQL para o `MAX()` escolher o mais próximo; vira nome aqui, onde é lido.
 */
const NIVEL_CNAE: Record<number, keyof typeof PESO_NIVEL_CNAE | undefined> = {
  4: 'subclasse',
  3: 'classe',
  2: 'grupo',
  1: 'divisao',
};

/**
 * Teto do sinal de "ramo vizinho", multiplicando o peso do nível.
 *
 * 0,2 não é arbitrário: o menor score possível por CNAE idêntico é 0,217 (um
 * único CNAE em comum, sem ser o principal → 0,65/3). Com este teto, o vizinho
 * mais próximo — mesma classe — chega a 0,14, ficando garantidamente abaixo.
 * Mexer nisto sem refazer a conta inverte a ordem entre "mesmo ramo" e "ramo
 * parecido".
 */
const TETO_VIZINHO = 0.2;

interface LinhaSemelhante {
  clienteId: string;
  razaoSocial: string;
  codigoErp: string | null;
  municipio: string | null;
  uf: string | null;
  produtosEmComum: number;
  tamanhoCesta: number;
  cnaesEmComum: number;
  nivelMaximo: number;
  naCarteira: boolean;
  mesmoCnaePrincipal: boolean;
  mesmaRegiao: boolean;
}

interface LinhaProduto {
  produtoId: string;
  codigoErp: string;
  descricao: string;
  clientes: number;
  valorTotal: number;
  ultimaCompra: Date | null;
  evidencia: string[] | null;
  outrosClientes: number;
}

/**
 * Sugestão de compra por afinidade entre clientes.
 *
 * A pergunta que responde: *"clientes parecidos com este compram alguma coisa
 * que ele não compra?"* — que é a conversa de cross-sell que o vendedor já tenta
 * fazer de cabeça, só que sobre 800 clientes e milhares de produtos.
 *
 * ## Escopo: compara com a base inteira, identifica só a carteira
 *
 * O **alvo** precisa estar na carteira do usuário — consultar cliente alheio
 * continua vedado. Os **comparáveis**, não: a semelhança por ramo diz muito
 * mais com 800 clientes do que com os 60 de uma carteira, e o que se entrega
 * aqui são produtos, não clientes.
 *
 * O que fecha a porta é a saída, não a entrada. Comparável de outra carteira
 * volta sem identificação (`naCarteira: false`, sem razão social, sem id, sem
 * município) e não pode ser nomeado na evidência — vira contagem. Ele
 * contribuiu para o padrão sem nunca ter sido revelado.
 *
 * Ao acrescentar campo ao retorno de `clientesSemelhantes`, lembre que parte
 * deles é de carteira alheia: todo campo novo precisa passar pelo mesmo corte.
 */
@Injectable()
export class SugestaoCompraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  async paraCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    query: SugestaoCompraQuery,
  ): Promise<SugestaoCompraResultado> {
    return this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);

        const alvo = await tx.cliente.findFirst({
          where: {
            id: clienteId,
            empresaId,
            deletedAt: null,
            ...(escopo ? { vendedorId: { in: escopo } } : {}),
          },
          select: {
            id: true,
            razaoSocial: true,
            municipio: true,
            uf: true,
            tabelaPrecoId: true,
          },
        });
        if (!alvo) throw new NotFoundException('Cliente não encontrado');

        const meses = await this.parametros.obterNumero(
          empresaId,
          'SUGESTAO_COMPRA_MESES',
          query.meses,
          tx,
        );
        const desde = new Date();
        desde.setMonth(desde.getMonth() - meses);

        const cnaesAlvo = await tx.clienteCnae.findMany({
          where: { empresaId, clienteId, deletedAt: null },
          include: { cnae: { select: { codigoErp: true, descricao: true } } },
          orderBy: { principal: 'desc' },
        });

        const cestaAlvo = await this.cestaDoCliente(
          tx,
          empresaId,
          clienteId,
          desde,
        );

        const vazio = (aviso: string): SugestaoCompraResultado => ({
          clienteId: alvo.id,
          razaoSocial: alvo.razaoSocial,
          produtosNaCesta: cestaAlvo.length,
          cnaes: cnaesAlvo.map(
            (c) => `${c.cnae.codigoErp ?? '—'} — ${c.cnae.descricao}`,
          ),
          clientesSemelhantes: [],
          sugestoes: [],
          aviso,
        });

        // Sem histórico não há cesta a comparar. Com só CNAE ainda daria para
        // sugerir o que o ramo compra — fica registrado como evolução; hoje o
        // motor precisa de pelo menos uma compra.
        if (cestaAlvo.length === 0) {
          return vazio(
            'Este cliente não tem compras no período — sem cesta para comparar. ' +
              'Aumente a janela de meses ou use a lista de mais vendidos do ramo.',
          );
        }

        const semelhantes = await this.buscarSemelhantes(tx, {
          empresaId,
          clienteId,
          escopo,
          desde,
          cestaAlvo,
          municipio: alvo.municipio,
          uf: alvo.uf,
          query,
          hierarquico: query.afinidadeCnae === 'hierarquica',
        });

        if (semelhantes.length === 0) {
          return vazio(
            'Nenhum cliente semelhante encontrado na base dentro do período.',
          );
        }

        const produtos = await this.produtosDosSemelhantes(tx, {
          empresaId,
          desde,
          semelhantes: semelhantes.map((s) => s.clienteId),
          daCarteira: semelhantes
            .filter((s) => s.naCarteira)
            .map((s) => s.clienteId),
          cestaAlvo,
          limite: query.limite,
        });

        if (produtos.length === 0) {
          return vazio(
            'Os clientes semelhantes não compram nada além do que este cliente já compra.',
          );
        }

        const precos = await this.precosNaTabelaDoCliente(
          tx,
          empresaId,
          alvo.tabelaPrecoId,
          produtos.map((p) => p.produtoId),
        );

        const total = semelhantes.length;
        const sugestoes: ProdutoSugerido[] = produtos.map((p) => {
          const cobertura = p.clientes / total;
          return {
            produtoId: p.produtoId,
            codigoErp: p.codigoErp,
            descricao: p.descricao,
            score: Math.round(cobertura * 100) / 100,
            semelhantesQueCompram: p.clientes,
            totalSemelhantes: total,
            cobertura: Math.round(cobertura * 100) / 100,
            valorMedio:
              Math.round((p.valorTotal / Math.max(p.clientes, 1)) * 100) / 100,
            ultimaCompraNoGrupo: p.ultimaCompra ?? null,
            precoTabelaCliente: precos.get(p.produtoId) ?? null,
            // Sem nomes a mostrar (todos os compradores são de outras
            // carteiras), a evidência vira o número — que continua sendo
            // argumento, sem identificar ninguém.
            evidencia: [
              ...(p.evidencia ?? []),
              ...(p.outrosClientes > 0
                ? [
                    `+${p.outrosClientes} cliente(s) do mesmo perfil em outras carteiras`,
                  ]
                : []),
            ],
          };
        }) as ProdutoSugerido[];

        return {
          clienteId: alvo.id,
          razaoSocial: alvo.razaoSocial,
          produtosNaCesta: cestaAlvo.length,
          cnaes: cnaesAlvo.map(
            (c) => `${c.cnae.codigoErp ?? '—'} — ${c.cnae.descricao}`,
          ),
          // Anonimização acontece **aqui**, na saída: o cálculo acima precisou
          // dos ids reais para agregar os produtos. Quem está fora da carteira
          // contribuiu para o padrão e volta sem identificação.
          clientesSemelhantes: semelhantes.map((s) =>
            s.naCarteira
              ? s
              : {
                  ...s,
                  clienteId: '',
                  razaoSocial: 'Cliente de outra carteira',
                  codigoErp: null,
                  municipio: null,
                  uf: null,
                },
          ),
          sugestoes,
          aviso: null,
        };
      },
      // A varredura de cesta cruza a maior tabela da base; o default de 5s do
      // Prisma é curto para carteiras grandes.
      { timeout: 30_000 },
    );
  }

  /** Produtos distintos que o cliente comprou no período. */
  private async cestaDoCliente(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    desde: Date,
  ): Promise<string[]> {
    const linhas = await tx.$queryRaw<{ produtoId: string }[]>(Prisma.sql`
      SELECT DISTINCT i."produtoId"
      FROM "notas_saida_itens" i
      JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
      WHERE i."empresaId" = ${empresaId}
        AND i."clienteId" = ${clienteId}
        AND i."produtoId" IS NOT NULL
        AND i."deletedAt" IS NULL
        AND i."ativo" = true
        AND i."dtEmissao" >= ${desde}
        AND ${NOTA_DE_VENDA}
    `);
    return linhas.map((l) => l.produtoId);
  }

  /**
   * Top-K clientes mais parecidos. O teto de K não é enfeite: sem ele a
   * agregação de produtos varreria a carteira inteira para cada consulta.
   */
  private async buscarSemelhantes(
    tx: TenantTx,
    p: {
      empresaId: string;
      clienteId: string;
      escopo: string[] | null;
      desde: Date;
      cestaAlvo: string[];
      municipio: string | null;
      uf: string | null;
      query: SugestaoCompraQuery;
      hierarquico: boolean;
    },
  ): Promise<ClienteSemelhante[]> {
    // O universo de comparação é a **base inteira**, de propósito: a semelhança
    // por ramo fica muito melhor com 800 clientes do que com os 60 de uma
    // carteira, e o resultado entregue são produtos, não clientes.
    //
    // O escopo não sumiu — mudou de papel. Deixou de filtrar *quem entra no
    // cálculo* e passou a decidir *quem pode ser nomeado na saída*: cliente de
    // outra carteira contribui para o padrão, mas volta sem identificação.
    const naCarteira =
      p.escopo === null
        ? Prisma.sql`true`
        : p.escopo.length > 0
          ? Prisma.sql`c."vendedorId" IN (${Prisma.join(p.escopo)})`
          : Prisma.sql`false`;

    const linhas = await tx.$queryRaw<LinhaSemelhante[]>(Prisma.sql`
      WITH cestas AS (
        SELECT i."clienteId", i."produtoId"
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
        JOIN "clientes" c ON c."id" = i."clienteId"
             AND c."deletedAt" IS NULL AND c."ativo" = true
        WHERE i."empresaId" = ${p.empresaId}
          AND i."clienteId" <> ${p.clienteId}
          AND i."produtoId" IS NOT NULL
          AND i."deletedAt" IS NULL
          AND i."ativo" = true
          AND i."dtEmissao" >= ${p.desde}
          AND ${NOTA_DE_VENDA}
        GROUP BY i."clienteId", i."produtoId"
      ),
      medidas AS (
        SELECT
          ct."clienteId",
          COUNT(*)::int AS "tamanhoCesta",
          COUNT(*) FILTER (
            WHERE ct."produtoId" = ANY(${p.cestaAlvo}::text[])
          )::int AS "produtosEmComum"
        FROM cestas ct
        GROUP BY ct."clienteId"
      ),
      cnae_alvo AS (
        SELECT cc."cnaeId", cc."principal",
               c."subclasse", c."classe", c."grupo", c."divisao"
        FROM "cliente_cnaes" cc
        JOIN "cnaes" c ON c."id" = cc."cnaeId"
        WHERE cc."empresaId" = ${p.empresaId} AND cc."clienteId" = ${p.clienteId}
          AND cc."deletedAt" IS NULL
      ),
      -- Parentesco entre cada CNAE do candidato e cada CNAE do alvo. O JOIN
      -- deixou de ser por id: agora casa em qualquer nível da hierarquia, e o
      -- nível mais próximo é escolhido depois com MAX() sobre a escala.
      cnae_pares AS (
        SELECT
          cc."clienteId",
          cc."cnaeId",
          -- Exige a subclasse idêntica: "mesmo CNAE principal" significa o
          -- mesmo ramo, não um ramo vizinho. Sem comparar os ids, o bônus de
          -- 0,35 passaria a valer para parentesco de classe e inflaria o score
          -- de quem a regra exata já pontuava.
          (cc."principal" AND ca."principal" AND c."id" = ca."cnaeId") AS "principalCasado",
          (c."id" = ca."cnaeId") AS "mesmoCnae",
          CASE
            WHEN c."subclasse" IS NOT DISTINCT FROM ca."subclasse" THEN 4
            WHEN ${p.hierarquico}::boolean IS NOT TRUE THEN 0
            WHEN c."classe"  IS NOT DISTINCT FROM ca."classe"  THEN 3
            WHEN c."grupo"   IS NOT DISTINCT FROM ca."grupo"   THEN 2
            WHEN c."divisao" IS NOT DISTINCT FROM ca."divisao" THEN 1
            ELSE 0
          END AS "nivel"
        FROM "cliente_cnaes" cc
        JOIN "cnaes" c ON c."id" = cc."cnaeId"
        JOIN cnae_alvo ca ON (
          c."subclasse" IS NOT DISTINCT FROM ca."subclasse"
          OR (${p.hierarquico}::boolean AND (
                c."classe"  IS NOT DISTINCT FROM ca."classe"
             OR c."grupo"   IS NOT DISTINCT FROM ca."grupo"
             OR c."divisao" IS NOT DISTINCT FROM ca."divisao"))
        )
        WHERE cc."empresaId" = ${p.empresaId} AND cc."deletedAt" IS NULL
      ),
      cnae_medidas AS (
        SELECT
          "clienteId",
          -- Continua contando só a subclasse idêntica: é o número que a tela
          -- já mostra como "CNAEs em comum", e mudar seu significado
          -- confundiria quem usa a consulta hoje.
          COUNT(DISTINCT CASE WHEN "mesmoCnae" THEN "cnaeId" END)::int AS "cnaesEmComum",
          MAX("nivel")::int AS "nivelMaximo",
          BOOL_OR("principalCasado") AS "mesmoCnaePrincipal"
        FROM cnae_pares
        WHERE "nivel" > 0
        GROUP BY "clienteId"
      )
      SELECT
        m."clienteId",
        c."razaoSocial",
        c."codigoErp",
        c."municipio",
        c."uf",
        m."produtosEmComum",
        m."tamanhoCesta",
        COALESCE(cm."cnaesEmComum", 0) AS "cnaesEmComum",
        COALESCE(cm."nivelMaximo", 0) AS "nivelMaximo",
        COALESCE(cm."mesmoCnaePrincipal", false) AS "mesmoCnaePrincipal",
        ${naCarteira} AS "naCarteira",
        (c."uf" IS NOT DISTINCT FROM ${p.uf}
         AND c."municipio" IS NOT DISTINCT FROM ${p.municipio}) AS "mesmaRegiao"
      FROM medidas m
      JOIN "clientes" c ON c."id" = m."clienteId"
      LEFT JOIN cnae_medidas cm ON cm."clienteId" = m."clienteId"
      -- Descarta quem não tem nenhuma afinidade: sem produto em comum e sem
      -- CNAE em comum não é "pouco parecido", é outro negócio.
      WHERE m."produtosEmComum" > 0 OR COALESCE(cm."nivelMaximo", 0) > 0
    `);

    const tamanhoAlvo = p.cestaAlvo.length;
    const usaCesta = p.query.baseSemelhanca !== 'cnae';
    const usaCnae = p.query.baseSemelhanca !== 'cesta';

    return linhas
      .map((l) => {
        // Jaccard: interseção sobre união. Penaliza naturalmente o cliente
        // gigante que compra de tudo e por isso "parece" com todo mundo.
        const uniao = tamanhoAlvo + l.tamanhoCesta - l.produtosEmComum;
        const indiceCesta = uniao > 0 ? l.produtosEmComum / uniao : 0;

        // CNAE: satura em 3 compartilhados — do quarto em diante não diz mais
        // nada sobre o ramo.
        const afinidadeCnae = Math.min(l.cnaesEmComum, 3) / 3;
        const bonusPrincipal = l.mesmoCnaePrincipal ? 0.35 : 0;

        const nivel = NIVEL_CNAE[l.nivelMaximo] ?? null;

        // Quem divide a subclasse mantém **exatamente** a fórmula anterior: a
        // regra hierárquica não pode remexer no score de quem a regra antiga
        // já reconhecia, senão a comparação entre as duas não diz nada.
        //
        // O ramo vizinho entra como sinal fraco, tabelado por `TETO_VIZINHO`
        // para ficar sempre **abaixo do piso do exato** (0,217 = um único CNAE
        // idêntico, sem ser o principal). Assim um vizinho de classe nunca
        // ultrapassa quem de fato divide a subclasse — ele só deixa de valer
        // zero, que é o ponto da mudança.
        const scoreCnae =
          nivel === 'subclasse'
            ? Math.min(afinidadeCnae * 0.65 + bonusPrincipal, 1)
            : nivel
              ? PESO_NIVEL_CNAE[nivel] * TETO_VIZINHO
              : 0;

        const score =
          (usaCesta ? indiceCesta * 0.6 : 0) +
          (usaCnae ? scoreCnae * 0.4 : 0) +
          // Região só desempata; não deve promover um cliente de outro ramo.
          (l.mesmaRegiao ? 0.05 : 0);

        return {
          clienteId: l.clienteId,
          razaoSocial: l.razaoSocial,
          codigoErp: l.codigoErp,
          municipio: l.municipio,
          uf: l.uf,
          naCarteira: l.naCarteira,
          score: Math.round(score * 100) / 100,
          indiceCesta: Math.round(indiceCesta * 100) / 100,
          cnaesEmComum: l.cnaesEmComum,
          nivelCnae: nivel,
          mesmoCnaePrincipal: l.mesmoCnaePrincipal,
          mesmaRegiao: l.mesmaRegiao,
          produtosEmComum: l.produtosEmComum,
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, p.query.semelhantes);
  }

  /** Produtos comprados pelos semelhantes e ausentes da cesta do alvo. */
  private async produtosDosSemelhantes(
    tx: TenantTx,
    p: {
      empresaId: string;
      desde: Date;
      semelhantes: string[];
      /** Subconjunto que pode ser nomeado na evidência. */
      daCarteira: string[];
      cestaAlvo: string[];
      limite: number;
    },
  ): Promise<LinhaProduto[]> {
    return tx.$queryRaw<LinhaProduto[]>(Prisma.sql`
      SELECT
        pr."id"        AS "produtoId",
        pr."codigoErp" AS "codigoErp",
        pr."descricao" AS "descricao",
        COUNT(DISTINCT i."clienteId")::int AS "clientes",
        SUM(i."vlrTotal")::float8          AS "valorTotal",
        MAX(i."dtEmissao")                 AS "ultimaCompra",
        -- Nomeia apenas clientes da carteira do usuário: são os únicos que ele
        -- já poderia ver, e os únicos que servem de argumento de venda ("o
        -- Fulano aqui do lado compra"). Os de fora entram na contagem abaixo.
        (ARRAY_AGG(DISTINCT c."razaoSocial") FILTER (WHERE c."id" = ANY(${p.daCarteira}::text[])))[1:3] AS "evidencia",
        COUNT(DISTINCT i."clienteId") FILTER (
          WHERE NOT (c."id" = ANY(${p.daCarteira}::text[]))
        )::int AS "outrosClientes"
      FROM "notas_saida_itens" i
      JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
      JOIN "produtos" pr ON pr."id" = i."produtoId"
           AND pr."deletedAt" IS NULL AND pr."ativo" = true
      JOIN "clientes" c ON c."id" = i."clienteId"
      WHERE i."empresaId" = ${p.empresaId}
        AND i."clienteId" IN (${Prisma.join(p.semelhantes)})
        AND i."produtoId" IS NOT NULL
        AND NOT (i."produtoId" = ANY(${p.cestaAlvo}::text[]))
        AND i."deletedAt" IS NULL
        AND i."ativo" = true
        AND i."dtEmissao" >= ${p.desde}
        AND ${NOTA_DE_VENDA}
      GROUP BY pr."id", pr."codigoErp", pr."descricao"
      -- Produto que só um semelhante compra é idiossincrasia dele, não padrão
      -- do grupo.
      HAVING COUNT(DISTINCT i."clienteId") > 1
      ORDER BY "clientes" DESC, "valorTotal" DESC
      LIMIT ${p.limite}
    `);
  }

  /**
   * Preço vigente na tabela do cliente-alvo. Sugerir sem preço obriga o
   * vendedor a abrir outra tela para saber por quanto vender.
   */
  private async precosNaTabelaDoCliente(
    tx: TenantTx,
    empresaId: string,
    tabelaPrecoId: string | null,
    produtoIds: string[],
  ): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (!tabelaPrecoId || produtoIds.length === 0) return mapa;

    const itens = await tx.tabelaPrecoItem.findMany({
      where: {
        empresaId,
        tabelaPrecoId,
        produtoId: { in: produtoIds },
        deletedAt: null,
      },
      select: { produtoId: true, preco: true },
    });
    for (const item of itens) {
      if (item.produtoId) mapa.set(item.produtoId, item.preco);
    }
    return mapa;
  }
}
