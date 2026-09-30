"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

/**
 * Conta a abertura de cada tela para a aba "Uso por Rotina" de Administração >
 * Acessos. Manda só o caminho; a API descobre a rotina pela rota do menu.
 *
 * Medição, não funcionalidade: não espera resposta nem mostra erro, e o mesmo
 * caminho repetido (re-render, troca de aba da página) não conta de novo.
 */
export function RegistroUsoRotina() {
  const pathname = usePathname();
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === ultimo.current) return;
    ultimo.current = pathname;
    void apiFetch("/acessos/uso", { method: "POST", body: { rota: pathname } }).catch(() => {});
  }, [pathname]);

  return null;
}
