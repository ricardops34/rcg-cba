"use client";

import { UsuarioForm } from "@/components/crud/usuario-form";
import { NovoUsuarioDoGrupo } from "@/components/crud/grupos-economicos";
import { useQuery } from "@tanstack/react-query";
import type { GrupoContexto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export default function NovoUsuarioPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useQuery({
    queryKey: ["grupos-economicos", user?.id, user?.empresaAtivaId],
    queryFn: () => apiFetch<GrupoContexto>("/grupos-economicos"),
  });
  if (isLoading) return <p>Carregando grupo econômico…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  const grupo = data?.grupos[0];
  if (grupo && !user?.administradorPlataforma) return <div className="space-y-4"><h1 className="text-xl font-semibold">Novo usuário · {grupo.descricao}</h1><NovoUsuarioDoGrupo grupo={grupo} /></div>;
  return <UsuarioForm />;
}
