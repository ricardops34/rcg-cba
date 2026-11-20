"use client";

import { MapaClientesTela } from "@/components/comercial/mapa-clientes-tela";

/** Comercial > Mapa de Clientes (20/11/2026): a carteira, os leads e o calor. */
export default function MapaClientesPage() {
  return (
    <MapaClientesTela
      titulo="Mapa de Clientes"
      descricao="Clientes da carteira e leads abertos. Troque a cor, veja o mapa de calor ou só os leads."
      mostrarInicial="ambos"
    />
  );
}
