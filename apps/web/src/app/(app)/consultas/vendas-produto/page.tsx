"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ConsultaVendasView, TODOS } from "@/components/consultas/consulta-vendas-view";

// Consulta gerencial: vendas do ano somadas mês a mês, uma linha por produto.
export default function ConsultaVendasProdutoPage() {
  const [categoriaId, setCategoriaId] = useState(TODOS);

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
        label: "Categoria",
        valor: categoriaId,
        onChange: setCategoriaId,
        opcoes: (categoriasQuery.data?.data ?? []).map((c) => ({
          id: c.id,
          descricao: c.descricao,
        })),
        carregando: categoriasQuery.isLoading,
      }}
      queryExtra={{ categoriaId: categoriaId === TODOS ? undefined : categoriaId }}
    />
  );
}
