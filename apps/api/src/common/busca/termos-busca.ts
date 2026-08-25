import { Prisma } from '../prisma/prisma.service';

/**
 * Busca textual por **termos**, não por frase inteira.
 *
 * O `contains` da string digitada inteira erra justamente o caso mais comum de
 * busca por gente: nome parcial, abreviado ou fora de ordem. `"Ricard patay"`
 * não é substring de `"RICARDO PATAY SOTOMAYOR"` — o `o` de RICARDO fica no
 * meio —, e a busca respondia "não encontrado" para um cliente que existe.
 * Quebrado em termos, cada pedaço bate e o cliente aparece.
 *
 * Semântica: **E entre os termos, OU entre os campos** — todo termo precisa
 * aparecer em algum dos campos, não necessariamente no mesmo. É o que faz
 * `"patay campo grande"` funcionar com o nome na razão social e a cidade no
 * município, quando o município estiver na lista de campos.
 *
 * Um termo só se comporta exatamente como o `contains` anterior, então CNPJ,
 * código ERP e razão social completa não mudam de resultado.
 */

/**
 * Teto de termos por busca. Cada termo vira um `AND` com um `OR` por campo, e
 * uma frase colada no campo de busca não pode virar uma consulta cara.
 */
const MAX_TERMOS = 6;

export function termosDeBusca(busca: string | null | undefined): string[] {
  return (busca ?? '').trim().split(/\s+/).filter(Boolean).slice(0, MAX_TERMOS);
}

type CampoContains = Record<string, { contains: string; mode: 'insensitive' }>;

/**
 * Filtro para o query builder do Prisma, pronto para espalhar no `where`:
 * `...filtroBuscaTermos(query.search, ['razaoSocial', 'cnpjCpf'])`.
 *
 * Devolve `{}` quando não há o que buscar — e usa a chave `AND`, então o
 * `where` que o receber não pode ter um `AND` próprio.
 */
export function filtroBuscaTermos(
  busca: string | null | undefined,
  campos: string[],
): { AND?: { OR: CampoContains[] }[] } {
  const termos = termosDeBusca(busca);
  if (termos.length === 0) return {};
  return {
    AND: termos.map((termo) => ({
      OR: campos.map((campo) => ({
        [campo]: { contains: termo, mode: 'insensitive' as const },
      })),
    })),
  };
}

/**
 * Mesma semântica em SQL bruto, para as listagens que não passam pelo query
 * builder. Devolve `null` quando não há termo — quem chama decide se acrescenta
 * a condição.
 */
export function condicaoBuscaTermosSql(
  busca: string | null | undefined,
  colunas: Prisma.Sql[],
): Prisma.Sql | null {
  const termos = termosDeBusca(busca);
  if (termos.length === 0) return null;
  return Prisma.join(
    termos.map((termo) => {
      const like = `%${termo}%`;
      return Prisma.sql`(${Prisma.join(
        colunas.map((coluna) => Prisma.sql`${coluna} ILIKE ${like}`),
        ' OR ',
      )})`;
    }),
    ' AND ',
  );
}
