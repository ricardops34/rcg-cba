"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { TAMANHOS_PAGINA } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Itens por página de uma listagem paginada. Vale, nesta ordem:
 *
 * 1. a troca que o usuário fez no seletor desta tela (lembrada no navegador,
 *    por usuário e por tela);
 * 2. o tamanho do usuário (Meu perfil) ou, sem ele, o do perfil — o /me já
 *    entrega resolvido em `tamanhoPagina`;
 * 3. o padrão da própria tela.
 *
 * A chave da tela é a rota. Lista que mora dentro de cortina ou cartão passa
 * `tela`, senão dividiria a memória com a tela por trás dela.
 *
 * O lembrado fica no localStorage, como as colunas ocultas da EntityTable:
 * é por navegador, não segue o usuário para outro aparelho. Salvar o tamanho
 * em Meu perfil apaga o lembrado (ver `esquecerTamanhosLembrados`) — quem
 * escolhe um número para todas espera vê-lo em todas.
 */
export function useTamanhoPagina(
  padraoDaTela: number,
  tela?: string,
): [number, (tamanho: number) => void] {
  const rota = usePathname();
  const usuarioId = useAuthStore((s) => s.user?.id);
  const preferido = useAuthStore((s) => s.user?.tamanhoPagina ?? null);
  const chave = usuarioId ? chaveLembrada(usuarioId, tela ?? rota) : null;

  // Guarda a chave junto: se o usuário chegar depois da primeira renderização
  // (ou trocar), relê em vez de usar o valor de outra chave.
  const [lembrado, setLembrado] = useState(() => ({ chave, valor: ler(chave) }));
  const valorLembrado = lembrado.chave === chave ? lembrado.valor : ler(chave);

  const definir = (tamanho: number) => {
    setLembrado({ chave, valor: tamanho });
    if (!chave) return;
    try {
      window.localStorage.setItem(chave, String(tamanho));
    } catch {
      // navegador sem armazenamento: vale só nesta visita
    }
  };

  return [valorLembrado ?? preferido ?? padraoDaTela, definir];
}

const PREFIXO = "plataforma-tamanho-pagina";

function chaveLembrada(usuarioId: string, tela: string) {
  return `${PREFIXO}:${usuarioId}:${tela}`;
}

function ler(chave: string | null): number | null {
  if (!chave || typeof window === "undefined") return null;
  try {
    const n = Number(window.localStorage.getItem(chave));
    return (TAMANHOS_PAGINA as readonly number[]).includes(n) ? n : null;
  } catch {
    return null;
  }
}

/** Apaga as trocas lembradas tela a tela deste usuário neste navegador. */
export function esquecerTamanhosLembrados(usuarioId: string) {
  try {
    const inicio = `${PREFIXO}:${usuarioId}:`;
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(inicio)) chaves.push(k);
    }
    chaves.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // sem armazenamento, não há o que apagar
  }
}
