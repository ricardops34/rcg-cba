import type { RegraDescontoVinculo } from "@plataforma/contracts";

/**
 * Rótulo curto da regra de desconto vinculada, no formato "000001 · REGRA
 * GERAL". Usado em todas as telas que mostram o vínculo (produto, categoria,
 * itens de tabela de preço, de nota e de orçamento), para o campo aparecer
 * igual em toda parte. Sem vínculo, "—".
 */
export function regraDescontoLabel(regra?: RegraDescontoVinculo | null): string {
  if (!regra) return "—";
  return regra.codigoErp ? `${regra.codigoErp} · ${regra.descricao}` : regra.descricao;
}
