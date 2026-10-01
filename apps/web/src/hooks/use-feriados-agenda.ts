"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export type FeriadoAgenda = { data: string; descricao: string };
export function useFeriadosAgenda() {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  return useQuery({
    queryKey: ["feriados", "agenda", empresaId],
    queryFn: () => apiFetch<FeriadoAgenda[]>("/atividades/feriados"),
    enabled: !!empresaId,
  });
}
