"use client";

import { create } from "zustand";
import { useAgenteUiStore } from "@/stores/agente-ui-store";

interface ClienteDaJanela {
  /** Nulo para conversa ainda sem cliente — aberta pela lista da aba. */
  id: string | null;
  nome: string;
  /**
   * A conversa a abrir, quando quem chama sabe qual é — o cliente pode ter
   * mais de um número. Sem ela, abre a mais recente do cliente.
   */
  conversaId?: string;
}

interface AtendimentoJanelaState {
  /**
   * O cliente cujo atendimento de WhatsApp está na aba "WhatsApp" da janela
   * do assistente.
   *
   * Mora num store porque a janela é montada no shell do app: ela sobrevive à
   * navegação — o "Posição 360°" e o "Orçamento" da própria conversa levam
   * para outra tela, e a conversa tem de continuar aberta ao lado.
   */
  cliente: ClienteDaJanela | null;
  /** Abre a janela já na aba WhatsApp, com a conversa deste cliente. */
  abrir: (cliente: ClienteDaJanela) => void;
  /** Volta da conversa para a lista de conversas da aba. */
  limpar: () => void;
}

/** Só do momento: nada é persistido, reabrir o sistema começa sem cliente. */
export const useAtendimentoJanelaStore = create<AtendimentoJanelaState>()(
  (set) => ({
    cliente: null,
    abrir: (cliente) => {
      set({ cliente });
      const ui = useAgenteUiStore.getState();
      ui.setAba("whatsapp");
      ui.abrir();
    },
    limpar: () => {
      set({ cliente: null });
    },
  }),
);
