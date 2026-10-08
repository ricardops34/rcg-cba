"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * O que a tela guarda enquanto o vendedor vai e volta.
 *
 * Vive na memória do módulo — a sessão do navegador —, e não em
 * `localStorage`: o caso é "abri o detalhe e voltei", não "amanhã quero a
 * lista do jeito de ontem". Recarregar a página volta tudo ao padrão.
 */
const memoria = new Map<string, unknown>();

/**
 * `useState` que sobrevive a sair e voltar para a tela.
 *
 * Nasceu na Posição de Cliente: clicar na linha abre a posição detalhada, e
 * ao voltar a lista nascia de novo — filtros, página e ordenação perdidos, e
 * o vendedor refazia o recorte a cada cliente que consultava.
 *
 * A chave é por empresa ativa: o filtro de vendedor de uma empresa não pode
 * aparecer aplicado na outra.
 */
export function useEstadoDaTela<T>(
  chave: string,
  inicial: T | (() => T),
  opcoes?: {
    /** O valor inicial vale mesmo havendo um guardado — filtro que veio na URL. */
    ignorarGuardado?: boolean;
  },
): [T, Dispatch<SetStateAction<T>>] {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId ?? "");
  const chaveCompleta = `${empresaId}:${chave}`;
  const [valor, setValor] = useState<T>(() =>
    memoria.has(chaveCompleta) && !opcoes?.ignorarGuardado
      ? (memoria.get(chaveCompleta) as T)
      : typeof inicial === "function"
        ? (inicial as () => T)()
        : inicial,
  );
  useEffect(() => {
    memoria.set(chaveCompleta, valor);
  }, [chaveCompleta, valor]);
  return [valor, setValor];
}

/** A posição de rolagem guardada para a tela, se houver. */
export function rolagemGuardada(chave: string): number | undefined {
  const v = memoria.get(`rolagem:${chave}`);
  return typeof v === "number" ? v : undefined;
}

export function guardarRolagem(chave: string, topo: number) {
  memoria.set(`rolagem:${chave}`, topo);
}
