"use client";

import { ConsultaVendasCategoriaView } from "@/components/consultas/consulta-vendas-categoria-view";

// Consulta gerencial: as vendas do período em árvore — categoria,
// subcategoria e produto. Ao contrário das outras consultas, os selects de
// filtro vivem dentro da view: a lista de subcategorias depende da categoria
// que está sendo escolhida na cortina, e a página não enxerga esse rascunho.
export default function ConsultaVendasCategoriaPage() {
  return <ConsultaVendasCategoriaView />;
}
