import type { TenantTx } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * null = sem restrição de carteira (admin, "Diretor" ou usuário sem Vendedor
 * vinculado, ex.: Administrativo). string[] = ids de Vendedor cujas carteiras
 * o usuário logado pode ver/mexer.
 *
 * Usado por Clientes, Notas de Saída, Itens e Títulos a Receber — a regra é
 * uma só (ver docs/planos/clientes-crud.md).
 */
export type EscopoVendedores = string[] | null;

/**
 * Resolve o escopo hierárquico do usuário logado a partir do cadastro de
 * Vendedor (vínculo por usuarioId): ele mesmo e **toda a árvore abaixo**.
 *
 * A hierarquia é um ponteiro só (`superiorId`) desde 2026-09-03, e sem número
 * fixo de níveis — por isso a CTE recursiva. Antes eram dois campos diretos
 * (`supervisorId`, `gerenteId`) e duas consultas simples resolviam, ao custo
 * de a hierarquia só existir em dois degraus e poder se contradizer.
 *
 * O recorte **não olha o `tipo`**: quem tem gente abaixo enxerga essa gente,
 * qualquer que seja o rótulo do cargo. Vendedor sem ninguém abaixo recebe só a
 * própria carteira, como antes.
 *
 * O `deletedAt IS NULL` está nos dois lados da recursão de propósito: um
 * supervisor excluído não deve continuar carregando o time dele para dentro do
 * escopo de quem estava acima.
 *
 * `UNION` (e não `UNION ALL`) já corta ciclo: um nó que reaparece não é
 * expandido de novo. O service impede ciclo na gravação, mas dado velho pode
 * ter um, e travar a consulta seria pior do que ignorá-lo.
 */
export async function resolverEscopoVendedores(
  tx: TenantTx,
  empresaId: string,
  user: AuthenticatedUser,
): Promise<EscopoVendedores> {
  if (user.isAdmin) return null; // acesso total (cobre Administrador; "Diretor" tratado igual)

  const vendedor = await tx.vendedor.findFirst({
    where: { usuarioId: user.id, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (!vendedor) return null; // sem Vendedor vinculado (ex.: Administrativo) = acesso total

  const linhas = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE time_do_vendedor AS (
      SELECT v."id"
      FROM "vendedores" v
      WHERE v."id" = ${vendedor.id}
        AND v."empresaId" = ${empresaId}
        AND v."deletedAt" IS NULL
      UNION
      SELECT abaixo."id"
      FROM "vendedores" abaixo
      JOIN time_do_vendedor t ON abaixo."superiorId" = t."id"
      WHERE abaixo."empresaId" = ${empresaId}
        AND abaixo."deletedAt" IS NULL
    )
    SELECT "id" FROM time_do_vendedor
  `;
  return linhas.map((l) => l.id);
}

/**
 * Combina o escopo com o filtro ?vendedorId= da query sem deixar o filtro
 * sobrescrever a restrição: um vendedorId fora do escopo força resultado
 * vazio em vez de vazar carteiras de fora do time.
 */
export function combinarFiltroVendedor(escopo: EscopoVendedores, vendedorIdQuery?: string) {
  if (escopo === null) return vendedorIdQuery ? { vendedorId: vendedorIdQuery } : {};
  if (!vendedorIdQuery) return { vendedorId: { in: escopo } };
  return {
    vendedorId: escopo.includes(vendedorIdQuery) ? vendedorIdQuery : { in: [] as string[] },
  };
}
