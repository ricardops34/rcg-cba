import { Prisma, type TenantTx } from '../../common/prisma/prisma.service';

/**
 * As regras de comodato por cliente, em SQL, num lugar só — a lista da
 * Posição de Cliente (ícone e filtros), a aba Equipamentos e a ferramenta da
 * IA respondem às mesmas perguntas e não podem divergir. Ver
 * docs/planos/equipamentos-comodato.md.
 *
 * `c` é sempre o alias do cliente.
 */

/** Janela do aviso "sem consumo" (decisão do usuário, 2026-10-07). */
export const COMODATO_DIAS_SEM_CONSUMO = 30;

/**
 * Saldo do equipamento `eq` (expressão SQL do produto) no cliente:
 * enviado em remessa − devolvido em retorno − baixas vigentes.
 */
export function saldoComodatoSql(eq: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(
    COALESCE((
      SELECT SUM(i."quantidade")
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
       WHERE i."empresaId" = c."empresaId" AND i."clienteId" = c."id"
         AND i."produtoId" = ${eq} AND i."comodato" = true
         AND i."deletedAt" IS NULL AND i."ativo" = true
         AND n."deletedAt" IS NULL AND n."ativo" = true
    ), 0)
    - COALESCE((
      SELECT SUM(i."quantidade")
        FROM "notas_entrada_itens" i
        JOIN "notas_entrada" n ON n."id" = i."notaEntradaId"
       WHERE i."empresaId" = c."empresaId" AND i."clienteId" = c."id"
         AND i."produtoId" = ${eq} AND i."comodato" = true
         AND i."deletedAt" IS NULL AND i."ativo" = true
         AND n."deletedAt" IS NULL AND n."ativo" = true
    ), 0)
    - COALESCE((
      SELECT SUM(b."quantidade")
        FROM "comodato_baixas" b
       WHERE b."empresaId" = c."empresaId" AND b."clienteId" = c."id"
         AND b."produtoId" = ${eq} AND b."desfeitaEm" IS NULL
    ), 0)
  )`;
}

/**
 * O cliente comprou algum aplicável do equipamento `eq` nos últimos
 * {@link COMODATO_DIAS_SEM_CONSUMO} dias.
 *
 * Conta qualquer nota de saída normal ativa, não só a que gerou duplicata: a
 * bonificação do papel também abastece o dispenser. O que se pergunta é "o
 * equipamento está sendo usado com produto nosso?", não "quanto foi vendido".
 */
export function comprouAplicavelSql(eq: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1
      FROM "produto_relacionados" r
      JOIN "notas_saida_itens" i
        ON i."produtoId" = r."relacionadoId"
       AND i."empresaId" = c."empresaId" AND i."clienteId" = c."id"
      JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
     WHERE r."empresaId" = c."empresaId" AND r."produtoId" = ${eq}
       AND r."tipo" = 'aplicacao'
       AND n."tipo" = 'N' AND n."ativo" = true AND n."deletedAt" IS NULL
       AND i."comodato" = false AND i."ativo" = true AND i."deletedAt" IS NULL
       AND i."dtEmissao" >= CURRENT_DATE - ${COMODATO_DIAS_SEM_CONSUMO}::int
  )`;
}

/**
 * Aviso "sem consumo": o cliente está com algum equipamento cadastrado (ativo,
 * com produtos aplicáveis) e não comprou nenhum aplicável dele no período.
 *
 * Montado como `c.id IN (conjunto)`, com o conjunto **sem correlação** com o
 * cliente da linha: o Postgres calcula a lista de clientes em aviso uma vez
 * por consulta e depois só confere a pertença. A primeira versão (EXISTS por
 * cliente, somando três tabelas para cada um) levava 5,9 s no filtro da lista
 * — a lista roda página e contagem, e estourava o limite de 5 s da transação.
 *
 * É a mesma regra de `saldoComodatoSql` + `comprouAplicavelSql`, que a aba
 * Equipamentos usa para um cliente só; se mudar lá, muda aqui.
 */
export function comodatoSemConsumoSql(empresaId: string): Prisma.Sql {
  return Prisma.sql`c."id" IN (
    WITH eq AS (
      SELECT e."produtoId"
        FROM "equipamentos_comodato" e
       WHERE e."empresaId" = ${empresaId} AND e."deletedAt" IS NULL AND e."ativo" = true
         AND EXISTS (
               SELECT 1 FROM "produto_relacionados" ra
                WHERE ra."empresaId" = ${empresaId} AND ra."produtoId" = e."produtoId"
                  AND ra."tipo" = 'aplicacao')
    ), em_poder AS (
      SELECT x."clienteId", x."produtoId"
        FROM (
          SELECT i."clienteId", i."produtoId", i."quantidade" AS q
            FROM "notas_saida_itens" i
            JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
           WHERE i."empresaId" = ${empresaId} AND i."comodato" = true
             AND i."produtoId" IN (SELECT "produtoId" FROM eq)
             AND i."deletedAt" IS NULL AND i."ativo" = true
             AND n."deletedAt" IS NULL AND n."ativo" = true
          UNION ALL
          SELECT i."clienteId", i."produtoId", -i."quantidade"
            FROM "notas_entrada_itens" i
            JOIN "notas_entrada" n ON n."id" = i."notaEntradaId"
           WHERE i."empresaId" = ${empresaId} AND i."comodato" = true
             AND i."produtoId" IN (SELECT "produtoId" FROM eq)
             AND i."deletedAt" IS NULL AND i."ativo" = true
             AND n."deletedAt" IS NULL AND n."ativo" = true
          UNION ALL
          SELECT b."clienteId", b."produtoId", -b."quantidade"
            FROM "comodato_baixas" b
           WHERE b."empresaId" = ${empresaId} AND b."desfeitaEm" IS NULL
             AND b."produtoId" IN (SELECT "produtoId" FROM eq)
        ) x
       WHERE x."clienteId" IS NOT NULL
       GROUP BY x."clienteId", x."produtoId"
      HAVING SUM(x.q) > 0
    )
    SELECT p."clienteId"
      FROM em_poder p
     WHERE NOT EXISTS (
             SELECT 1
               FROM "produto_relacionados" r
               JOIN "notas_saida_itens" i
                 ON i."produtoId" = r."relacionadoId"
                AND i."empresaId" = ${empresaId} AND i."clienteId" = p."clienteId"
               JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
              WHERE r."empresaId" = ${empresaId} AND r."produtoId" = p."produtoId"
                AND r."tipo" = 'aplicacao'
                AND n."tipo" = 'N' AND n."ativo" = true AND n."deletedAt" IS NULL
                AND i."comodato" = false AND i."ativo" = true AND i."deletedAt" IS NULL
                AND i."dtEmissao" >= CURRENT_DATE - ${COMODATO_DIAS_SEM_CONSUMO}::int)
  )`;
}

/** O cliente tem alguma baixa de comodato vigente. */
export const comodatoBaixadoSql = Prisma.sql`EXISTS (
  SELECT 1 FROM "comodato_baixas" b
   WHERE b."empresaId" = c."empresaId" AND b."clienteId" = c."id"
     AND b."desfeitaEm" IS NULL
)`;

/**
 * Nome de quem baixou, para a tela e o histórico dizerem "por quem". Dentro da
 * transação da requisição, que já carrega o grupo econômico de quem pede: o
 * RLS de `usuarios` mostra só os colegas do mesmo grupo, que é exatamente quem
 * pode ter feito a baixa.
 */
export async function nomesDeUsuarios(
  tx: TenantTx,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((v): v is string => !!v))];
  if (unicos.length === 0) return new Map();
  const usuarios = await tx.usuario.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nome: true },
  });
  return new Map(usuarios.map((u) => [u.id, u.nome]));
}
