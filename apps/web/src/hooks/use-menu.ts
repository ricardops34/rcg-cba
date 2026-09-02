"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
  ROTINAS_DEPENDENTES_WHATSAPP,
  useWhatsappIntegracao,
} from "@/hooks/use-whatsapp-integracao";

export interface MenuItem {
  id: string;
  nome: string;
  icone?: string | null;
  rota?: string | null;
  ordem: number;
  disponivelTelaPequena: boolean;
  rotinas: { id: string; codigo: string; nome: string; disponivelTelaPequena: boolean }[];
}

export interface ModuloComMenus {
  id: string;
  nome: string;
  icone?: string | null;
  ordem: number;
  disponivelTelaPequena: boolean;
  menus: MenuItem[];
}

/**
 * Menu lateral filtrado pelas permissões (`<rotinaCodigo>.visualizar`) da
 * empresa ativa. Um menu só aparece se pelo menos uma das rotinas que ele
 * agrupa for visível ao usuário; um módulo só aparece se sobrar algum menu.
 * O perfil Admin (sistemaBase) recebe todas as permissões no seed, então
 * naturalmente enxerga tudo sem tratamento especial aqui.
 *
 * Rotinas que dependem de uma integração externa (ver
 * `ROTINAS_DEPENDENTES_WHATSAPP`) somem enquanto a integração está desligada,
 * mesmo para quem tem a permissão: o item levaria a uma tela sem serventia.
 */
export function useMenu() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const permissoes = useAuthStore((s) => s.user?.permissoes);
  const { ativo: whatsappAtivo } = useWhatsappIntegracao();

  const query = useQuery({
    queryKey: ["modulos"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => {
    if (!query.data || !permissoes) return query.data;
    const podeVer = (codigo: string) =>
      permissoes.includes(`${codigo}.visualizar`) &&
      (whatsappAtivo === true ||
        !ROTINAS_DEPENDENTES_WHATSAPP.includes(codigo));

    return query.data
      .map((modulo) => ({
        ...modulo,
        menus: modulo.menus
          .map((menu) => ({
            ...menu,
            rotinas: (menu.rotinas ?? []).filter((rotina) => podeVer(rotina.codigo)),
          }))
          .filter((menu) => menu.rotinas.length > 0),
      }))
      .filter((modulo) => modulo.menus.length > 0);
  }, [query.data, permissoes, whatsappAtivo]);

  return { ...query, data };
}
