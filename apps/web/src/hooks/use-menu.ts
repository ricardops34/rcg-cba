"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export interface MenuItem {
  id: string;
  nome: string;
  icone?: string | null;
  rota?: string | null;
  ordem: number;
  rotinas: { id: string; codigo: string; nome: string }[];
}

export interface ModuloComMenus {
  id: string;
  nome: string;
  icone?: string | null;
  ordem: number;
  menus: MenuItem[];
}

/**
 * Menu lateral filtrado pelas permissões (`<rotinaCodigo>.visualizar`) da
 * empresa ativa. Um menu só aparece se pelo menos uma das rotinas que ele
 * agrupa for visível ao usuário; um módulo só aparece se sobrar algum menu.
 * O perfil Admin (sistemaBase) recebe todas as permissões no seed, então
 * naturalmente enxerga tudo sem tratamento especial aqui.
 */
export function useMenu() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const permissoes = useAuthStore((s) => s.user?.permissoes);

  const query = useQuery({
    queryKey: ["modulos"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => {
    if (!query.data || !permissoes) return query.data;
    const podeVer = (codigo: string) => permissoes.includes(`${codigo}.visualizar`);

    return query.data
      .map((modulo) => ({
        ...modulo,
        menus: modulo.menus.filter((menu) => (menu.rotinas ?? []).some((r) => podeVer(r.codigo))),
      }))
      .filter((modulo) => modulo.menus.length > 0);
  }, [query.data, permissoes]);

  return { ...query, data };
}
