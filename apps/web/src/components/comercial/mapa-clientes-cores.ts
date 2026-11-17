import type { SituacaoPinCliente } from "@plataforma/contracts";

/**
 * Cor de cada situação do pin no mapa da Posição de Cliente. Mesma leitura da
 * listagem: em aberto em azul (o "$" azul da tela), ativo em verde. Fica fora
 * do arquivo do Leaflet para a legenda não puxar o Leaflet para o carregamento
 * da página.
 */
export const COR_SITUACAO: Record<SituacaoPinCliente, string> = {
  bloqueado: "#b91c1c",
  titulo_vencido: "#ea580c",
  titulo_aberto: "#2563eb",
  ativo: "#16a34a",
  inativo: "#9ca3af",
};

/** Ordem da legenda: da pior situação para a melhor. */
export const ORDEM_SITUACAO: SituacaoPinCliente[] = [
  "bloqueado",
  "titulo_vencido",
  "titulo_aberto",
  "ativo",
  "inativo",
];

/** Lead no mapa: roxo, fora da escala de situação dos clientes. */
export const COR_LEAD = "#7c3aed";
