"use client";

import { useEffect, useState } from "react";

/**
 * Pré-seleciona um filtro/campo de vendedor com o próprio vendedor do
 * usuário logado (quando há vínculo) — só na primeira vez que o dado chega,
 * pra não sobrescrever se o usuário mudar a seleção manualmente depois (ex.:
 * voltar pra "Todos").
 */
export function useVendedorPadrao(
  meuVendedorId: string | null | undefined,
  aplicar: (vendedorId: string) => void,
) {
  const [aplicado, setAplicado] = useState(false);

  useEffect(() => {
    if (!aplicado && meuVendedorId) {
      aplicar(meuVendedorId);
      setAplicado(true);
    }
  }, [meuVendedorId, aplicado, aplicar]);
}
