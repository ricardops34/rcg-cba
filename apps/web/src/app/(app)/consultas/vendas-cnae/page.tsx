"use client";

import { ConsultaVendasCnaeView } from "@/components/consultas/consulta-vendas-cnae-view";

// Consulta gerencial: as vendas do período em árvore — CNAE do cliente e
// produto, com drill-down por cliente/nota no produto. Mesmo padrão da
// consulta por categoria (ver aquela página).
export default function ConsultaVendasCnaePage() {
  return <ConsultaVendasCnaeView />;
}
