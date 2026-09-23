"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, Layers, LayoutGrid } from "lucide-react";

export function EstruturaEmpresaSection({ empresaId }: { empresaId: string }) {
  const queryClient = useQueryClient();

  const { data: arvore, isLoading } = useQuery({
    queryKey: ["empresa-estrutura-arvore", empresaId],
    queryFn: () => apiFetch<any[]>(`/estrutura/arvore?empresaId=${empresaId}`),
  });

  const toggleModulo = useMutation({
    mutationFn: ({ moduloId, ativo }: { moduloId: string; ativo: boolean }) =>
      apiFetch(`/estrutura/empresa/modulos/${moduloId}?empresaId=${empresaId}`, {
        method: "PATCH",
        body: { ativo },
      }),
    onSuccess: () => {
      toast.success("Módulo atualizado para a empresa");
      queryClient.invalidateQueries({ queryKey: ["empresa-estrutura-arvore", empresaId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao alterar módulo");
    },
  });

  const toggleMenu = useMutation({
    mutationFn: ({ menuId, ativo }: { menuId: string; ativo: boolean }) =>
      apiFetch(`/estrutura/empresa/menus/${menuId}?empresaId=${empresaId}`, {
        method: "PATCH",
        body: { ativo },
      }),
    onSuccess: () => {
      toast.success("Menu atualizado para a empresa");
      queryClient.invalidateQueries({ queryKey: ["empresa-estrutura-arvore", empresaId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao alterar menu");
    },
  });

  const toggleRotina = useMutation({
    mutationFn: ({ rotinaId, ativo }: { rotinaId: string; ativo: boolean }) =>
      apiFetch(`/estrutura/empresa/rotinas/${rotinaId}?empresaId=${empresaId}`, {
        method: "PATCH",
        body: { ativo },
      }),
    onSuccess: () => {
      toast.success("Rotina atualizada para a empresa");
      queryClient.invalidateQueries({ queryKey: ["empresa-estrutura-arvore", empresaId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao alterar rotina");
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" /> Recursos & Rotinas Liberados para esta Empresa
        </CardTitle>
        <CardDescription>
          Controle individualmente quais Módulos, Menus e Rotinas esta empresa pode acessar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {arvore?.map((modulo: any) => (
          <div key={modulo.id} className="space-y-3 rounded-lg border p-4 bg-muted/10">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 font-semibold text-base">
                <Layers className="size-4 text-primary" /> {modulo.nome}
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <Checkbox
                  checked={modulo.ativoNaEmpresa}
                  onCheckedChange={(v) =>
                    toggleModulo.mutate({ moduloId: modulo.id, ativo: v === true })
                  }
                />
                Módulo Liberado
              </label>
            </div>

            <div className="pl-4 space-y-4">
              {modulo.menus?.map((menu: any) => (
                <div key={menu.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LayoutGrid className="size-3.5 text-muted-foreground" /> {menu.nome}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={menu.ativoNaEmpresa}
                        onCheckedChange={(v) =>
                          toggleMenu.mutate({ menuId: menu.id, ativo: v === true })
                        }
                      />
                      Menu Liberado
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3 pl-5">
                    {menu.rotinas?.map((rotina: any) => (
                      <label
                        key={rotina.id}
                        className={`flex items-center gap-2 text-xs border rounded-md px-3 py-1.5 cursor-pointer transition-colors ${
                          rotina.ativoNaEmpresa
                            ? "bg-primary/10 border-primary/30 text-foreground font-medium"
                            : "bg-background border-dashed text-muted-foreground opacity-70"
                        }`}
                      >
                        <Checkbox
                          checked={rotina.ativoNaEmpresa}
                          onCheckedChange={(v) =>
                            toggleRotina.mutate({ rotinaId: rotina.id, ativo: v === true })
                          }
                        />
                        <span>{rotina.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
