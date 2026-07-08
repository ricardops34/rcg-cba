"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export interface MenuItem {
  id: string;
  nome: string;
  icone?: string | null;
  rota?: string | null;
  ordem: number;
}

export interface ModuloComMenus {
  id: string;
  nome: string;
  icone?: string | null;
  ordem: number;
  menus: MenuItem[];
}

export function useMenu() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["modulos"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });
}
