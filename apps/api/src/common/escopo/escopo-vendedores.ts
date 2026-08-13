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
 * Vendedor (vínculo por usuarioId). Sem CTE recursiva: supervisorId e
 * gerenteId são campos diretos por linha do time todo, então uma query por
 * papel basta.
 */
export async function resolverEscopoVendedores(
  tx: TenantTx,
  empresaId: string,
  user: AuthenticatedUser,
): Promise<EscopoVendedores> {
  if (user.isAdmin) return null; // acesso total (cobre Administrador; "Diretor" tratado igual)

  const vendedor = await tx.vendedor.findFirst({
    where: { usuarioId: user.id, empresaId, deletedAt: null },
    select: { id: true, tipo: true },
  });
  if (!vendedor) return null; // sem Vendedor vinculado (ex.: Administrativo) = acesso total

  if (vendedor.tipo === 'gerente') {
    const gerenciados = await tx.vendedor.findMany({
      where: { empresaId, gerenteId: vendedor.id, deletedAt: null },
      select: { id: true },
    });
    return [vendedor.id, ...gerenciados.map((v) => v.id)];
  }
  if (vendedor.tipo === 'supervisor') {
    const supervisionados = await tx.vendedor.findMany({
      where: { empresaId, supervisorId: vendedor.id, deletedAt: null },
      select: { id: true },
    });
    return [vendedor.id, ...supervisionados.map((v) => v.id)];
  }
  return [vendedor.id]; // vendedor "puro": só a própria carteira
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
