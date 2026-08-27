"use client";

import { create } from "zustand";

interface AgenteUiState {
  /**
   * Janela do assistente visível na tela.
   *
   * Mora aqui, e não dentro do `AgenteFab`, porque quem manda abrir é o ícone
   * da topbar — ele e a janela precisam mexer no mesmo estado e ler o mesmo
   * indicador.
   */
  aberto: boolean;
  /** Resposta que chegou enquanto a janela estava escondida. */
  novidade: boolean;
  /** Ação parada esperando o Confirmar — trava até alguém decidir. */
  pendente: boolean;
  abrir: () => void;
  minimizar: () => void;
  setNovidade: (v: boolean) => void;
  setPendente: (v: boolean) => void;
}

/**
 * Estado só do momento: janela aberta e avisos pendentes não atravessam
 * sessões — reabrir o sistema não pode ressuscitar um "!" de uma conversa que
 * já morreu. Por isso nada aqui é persistido (a geometria da janela, essa sim,
 * fica no `localStorage`, dentro do `AgenteFab`).
 */
export const useAgenteUiStore = create<AgenteUiState>()((set) => ({
  aberto: false,
  novidade: false,
  pendente: false,
  // Abrir é também "eu li": o aviso de resposta nova morre aqui. A pendência
  // não — ela só sai quando a ação for confirmada ou cancelada.
  abrir: () => set({ aberto: true, novidade: false }),
  minimizar: () => set({ aberto: false }),
  setNovidade: (novidade) => set({ novidade }),
  setPendente: (pendente) => set({ pendente }),
}));
