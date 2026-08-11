"use client";

import { ConsultaVendasView } from "@/components/consultas/consulta-vendas-view";

// Consulta gerencial: vendas do ano somadas mês a mês, uma linha por cliente.
export default function ConsultaVendasClientePage() {
  return (
    <ConsultaVendasView
      titulo="Vendas por Cliente"
      rotuloEntidade="Cliente"
      rota="/consultas/vendas-cliente"
      rotina="consulta-vendas-cliente"
    />
  );
}
