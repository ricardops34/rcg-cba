"use client";

import { MapaClientesTela } from "@/components/comercial/mapa-clientes-tela";

/**
 * Gerencial > Mapa e Rotas (20/11/2026): a carteira da equipe por vendedor,
 * situação, dias sem compra e Top N. As rotas de visita entram aqui (fase 4
 * do plano docs/planos/2026-11-20-mapas-clientes-rotas.md).
 */
export default function MapaGerencialPage() {
  return (
    <MapaClientesTela
      titulo="Mapa e Rotas"
      descricao="Carteira da equipe no mapa. Use o filtro de vendedor, o Top e o período para planejar."
      mostrarInicial="clientes"
    />
  );
}
