"use client";

import { ConsultaVendasView } from "@/components/consultas/consulta-vendas-view";

// Consulta gerencial: vendas do ano somadas mês a mês, uma linha por vendedor.
// O filtro de vendedor continua disponível — serve para isolar um único
// vendedor (ou o time de um supervisor) na mesma tela.
export default function ConsultaVendasVendedorPage() {
  return (
    <ConsultaVendasView
      titulo="Vendas por Vendedor"
      rotuloEntidade="Vendedor"
      rota="/consultas/vendas-vendedor"
      rotina="consulta-vendas-vendedor"
    />
  );
}
