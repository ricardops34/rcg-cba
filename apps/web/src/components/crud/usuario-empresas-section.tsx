"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Empresa, Perfil } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { X } from "lucide-react";
import { useState } from "react";

interface UsuarioEmpresaLink {
  empresaId: string;
  perfilId: string;
  ativo: boolean;
  empresa: Empresa;
  perfil: Perfil;
}

interface UsuarioDetail {
  id: string;
  usuarioEmpresas: UsuarioEmpresaLink[];
}

/**
 * Sistema é multiempresa: todo usuário precisa de um vínculo Usuário×Empresa
 * (com um perfil por empresa) para poder logar naquela empresa. Aqui dá pra
 * ver, trocar o perfil, remover, e adicionar o vínculo com a empresa ativa —
 * vincular a OUTRA empresa exige trocar a empresa ativa primeiro, já que a
 * lista de perfis é sempre isolada (RLS) pela empresa em que você está logado.
 */
export function UsuarioEmpresasSection({ usuarioId }: { usuarioId: string }) {
  const qc = useQueryClient();
  const empresaAtivaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const [novoPerfilId, setNovoPerfilId] = useState<string>("");

  const detailQuery = useQuery({
    queryKey: ["usuarios", usuarioId],
    queryFn: () => apiFetch<UsuarioDetail>(`/usuarios/${usuarioId}`),
  });

  const perfisQuery = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["usuarios", usuarioId] });

  const vincular = useMutation({
    mutationFn: (perfilId: string) =>
      apiFetch(`/usuarios/${usuarioId}/empresas/${empresaAtivaId}`, {
        method: "POST",
        body: { perfilId },
      }),
    onSuccess: () => {
      invalidate();
      setNovoPerfilId("");
      toast.success("Vínculo criado");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao vincular"),
  });

  const desvincular = useMutation({
    mutationFn: (empresaId: string) =>
      apiFetch(`/usuarios/${usuarioId}/empresas/${empresaId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success("Vínculo removido");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao remover vínculo"),
  });

  const links = detailQuery.data?.usuarioEmpresas ?? [];
  const jaVinculadoNaAtiva = links.some((l) => l.empresaId === empresaAtivaId);

  return (
    <div className="space-y-2">
      <FieldLabel>Empresas vinculadas</FieldLabel>
      <FieldDescription>
        Sistema multiempresa: o usuário só consegue logar nas empresas listadas aqui, cada uma com seu
        próprio perfil.
      </FieldDescription>

      {detailQuery.isLoading && <Skeleton className="h-16 w-full rounded-xl" />}

      {!detailQuery.isLoading && (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.empresaId}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{link.empresa.nomeFantasia}</p>
                <p className="text-xs text-muted-foreground">{link.perfil.nome}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {link.empresaId === empresaAtivaId && <Badge variant="outline">Empresa ativa</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={desvincular.isPending}
                  onClick={() => {
                    if (confirm(`Remover o vínculo com "${link.empresa.nomeFantasia}"?`)) {
                      desvincular.mutate(link.empresaId);
                    }
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada ainda.</p>
          )}
        </div>
      )}

      {!jaVinculadoNaAtiva && !detailQuery.isLoading && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={novoPerfilId} onValueChange={setNovoPerfilId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Vincular à empresa ativa com o perfil..." />
            </SelectTrigger>
            <SelectContent>
              {perfisQuery.data?.data.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={!novoPerfilId || vincular.isPending}
            onClick={() => vincular.mutate(novoPerfilId)}
          >
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}
