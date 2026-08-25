"use client";

import { useSearchParams } from "next/navigation";

/**
 * Filtros que vêm prontos na URL — o que faz "abrir a tela já filtrada".
 *
 * Nasceu do assistente: ele responde "você tem 42 clientes ativos em Campo
 * Grande" e oferece o botão para ver a lista. Sem isso o botão abre a tela
 * inteira, sem filtro nenhum, e quem clicou tem de refazer à mão o recorte que
 * acabou de pedir em português.
 *
 * **Só na entrada.** Estes valores servem de estado inicial (`useState` com
 * inicializador); a partir daí quem manda é a tela, e mexer nos filtros não
 * reescreve a URL. Sincronizar nos dois sentidos exigiria cuidado com histórico
 * e voltas do navegador, e não é o que o link do agente precisa.
 *
 * Vale para qualquer origem, não só o agente: um link colado no WhatsApp da
 * equipe ou um favorito guardam o mesmo recorte.
 */
export function useFiltrosUrl() {
  const params = useSearchParams();

  return {
    /** Texto do parâmetro, ou `undefined` quando ausente/vazio. */
    texto(chave: string): string | undefined {
      const v = params.get(chave)?.trim();
      return v ? v : undefined;
    },

    /**
     * `"true"`/`"false"` na URL viram booleano; qualquer outra coisa vira
     * `undefined` — filtro escrito errado não deve esconder metade da base sem
     * o usuário perceber.
     */
    booleano(chave: string): boolean | undefined {
      const v = params.get(chave);
      if (v === "true") return true;
      if (v === "false") return false;
      return undefined;
    },

    /** Número inteiro válido, ou `undefined`. */
    numero(chave: string): number | undefined {
      const v = Number(params.get(chave));
      return Number.isFinite(v) && params.get(chave) ? v : undefined;
    },

    /**
     * Um dos valores aceitos pela tela, ou `undefined`. Evita que
     * `?status=qualquercoisa` coloque a tela num estado que ela não sabe
     * renderizar.
     */
    opcao<T extends string>(chave: string, aceitos: readonly T[]): T | undefined {
      const v = params.get(chave);
      return aceitos.includes(v as T) ? (v as T) : undefined;
    },
  };
}
