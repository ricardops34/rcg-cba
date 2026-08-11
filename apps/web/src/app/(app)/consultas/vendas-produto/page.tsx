"use client";

import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ConsultaVendasView } from "@/components/consultas/consulta-vendas-view";

// Consulta gerencial: vendas do período somadas mês a mês, uma linha por
// produto.
export default function ConsultaVendasProdutoPage() {
  // Só categorias raiz, como no formulário de Objetivos — a árvore inteira
  // num select de filtro é grande demais para navegar.
  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raiz"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: true },
      }),
  });

  return (
    <ConsultaVendasView
      titulo="Vendas por Produto"
      rotuloEntidade="Produto"
      rota="/consultas/vendas-produto"
      rotina="consulta-vendas-produto"
      filtroExtra={{
        chave: "categoriaId",
        label: "Categoria",
        rotuloTodos: "Todas",
        opcoes: (categoriasQuery.data?.data ?? []).map((c) => ({
          id: c.id,
          descricao: c.descricao,
        })),
      }}
    />
  );
}
