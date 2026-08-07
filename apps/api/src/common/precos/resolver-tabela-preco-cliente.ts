import type { TenantTx } from '../prisma/prisma.service';

/**
 * Tabela de preço que vale para um cliente na hora de precificar.
 *
 * Regra combinada com o comercial: quando o cliente não tem tabela vinculada,
 * ou a vinculada não existe mais / está inativa (a maior parte das tabelas
 * herdadas do legado foi desativada), cai numa tabela padrão escolhida pela
 * praça do cliente:
 *
 * - **capital** (mesmo município da empresa emitente) → tabela de codigoErp `001`;
 * - **interior** (qualquer outro município) → a "TABELA PADRAO INTERIOR" ativa.
 *
 * A capital sai do cadastro da própria empresa (Administração > Empresas), não
 * de uma lista fixa no código: cada empresa é de uma praça (RCG em Campo
 * Grande/MS, CBA em Cuiabá/MT) e uma empresa nova só precisa do cadastro
 * preenchido. Sem município na empresa não há como classificar, e a resolução
 * devolve o que estiver no cliente — nunca chuta uma tabela.
 *
 * Isto **não** altera o cadastro do cliente: o vínculo gravado continua como
 * está (inclusive vazio na tela), e a regra vale só no cálculo de preço.
 */

const CODIGO_CAPITAL = '001';
const DESCRICAO_INTERIOR = 'TABELA PADRAO INTERIOR';

/** Sem acento, sem espaço duplicado e em caixa alta — "Cuiabá" = "CUIABA". */
const normalizar = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export async function resolverTabelaPrecoCliente(
  tx: TenantTx,
  empresaId: string,
  clienteId: string,
): Promise<string | null> {
  const cliente = await tx.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { tabelaPrecoId: true, municipio: true, uf: true },
  });
  if (!cliente) return null;

  // Poucas tabelas ativas por empresa (2 na RCG hoje): uma consulta só resolve
  // tanto a validação da tabela do cliente quanto a escolha do padrão.
  const ativas = await tx.tabelaPreco.findMany({
    where: { empresaId, ativo: true, deletedAt: null },
    select: { id: true, codigoErp: true, descricao: true },
  });

  const doCliente = ativas.find((t) => t.id === cliente.tabelaPrecoId);
  if (doCliente) return doCliente.id;

  const empresa = await tx.empresa.findUnique({
    where: { id: empresaId },
    select: { municipio: true, uf: true },
  });
  if (!empresa?.municipio) return cliente.tabelaPrecoId;

  const capital =
    normalizar(empresa.municipio) === normalizar(cliente.municipio) &&
    // UF só desempata quando os dois lados têm o dado (municípios homônimos
    // em estados diferentes).
    (!empresa.uf ||
      !cliente.uf ||
      normalizar(empresa.uf) === normalizar(cliente.uf));

  const padrao = capital
    ? ativas.find((t) => t.codigoErp === CODIGO_CAPITAL)
    : ativas.find((t) => normalizar(t.descricao) === DESCRICAO_INTERIOR);

  // Sem tabela padrão cadastrada, devolve o vínculo do cliente como estava —
  // o chamador já trata id inexistente como "sem preço de tabela".
  return padrao?.id ?? cliente.tabelaPrecoId;
}
