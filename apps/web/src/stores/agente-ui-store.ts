"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AgenteUiState {
  /**
   * Janela do assistente visível na tela.
   *
   * Mora aqui, e não dentro do `AgenteFab`, porque quem manda abrir pode ser
   * o botão flutuante **ou** o ícone da topbar — os dois precisam mexer no
   * mesmo estado e ler o mesmo indicador.
   */
  aberto: boolean;
  /** Resposta que chegou enquanto a janela estava escondida. */
  novidade: boolean;
  /** Ação parada esperando o Confirmar — trava até alguém decidir. */
  pendente: boolean;
  /**
   * Preferência de quem usa: manter o botão flutuante no canto inferior
   * direito. Desligado, o assistente abre só pelo ícone da topbar — é a saída
   * para quem acha que o botão flutuante atrapalha a tela.
   *
   * Persistido no navegador (como a geometria da janela): é gosto de uso, não
   * dado de negócio.
   */
  flutuante: boolean;
  abrir: () => void;
  minimizar: () => void;
  setNovidade: (v: boolean) => void;
  setPendente: (v: boolean) => void;
  setFlutuante: (v: boolean) => void;
}

export const useAgenteUiStore = create<AgenteUiState>()(
  persist(
    (set) => ({
      aberto: false,
      novidade: false,
      pendente: false,
      flutuante: true,
      // Abrir é também "eu li": o aviso de resposta nova morre aqui. A
      // pendência não — ela só sai quando a ação for confirmada ou cancelada.
      abrir: () => set({ aberto: true, novidade: false }),
      minimizar: () => set({ aberto: false }),
      setNovidade: (novidade) => set({ novidade }),
      setPendente: (pendente) => set({ pendente }),
      setFlutuante: (flutuante) => set({ flutuante }),
    }),
    {
      name: "plataforma-agente-ui",
      // Só a preferência atravessa sessões. Janela aberta e avisos pendentes
      // são do momento: reabrir o sistema não pode ressuscitar um "!" de uma
      // conversa que já morreu.
      partialize: (s) => ({ flutuante: s.flutuante }),
    },
  ),
);
