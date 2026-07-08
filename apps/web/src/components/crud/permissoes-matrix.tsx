"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { acaoSchema, type Acao } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModuloComMenus } from "@/hooks/use-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ACAO_LABEL: Record<Acao, string> = {
  visualizar: "Ver",
  cadastrar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  importar: "Importar",
  exportar: "Exportar",
  aprovar: "Aprovar",
  cancelar: "Cancelar",
  bloquear: "Bloquear",
};
const ACOES = acaoSchema.options;

interface PerfilPermissaoRow {
  rotinaId: string;
  acao: Acao;
  permitido: boolean;
}

interface PerfilDetail {
  id: string;
  nome: string;
  sistemaBase: boolean;
  permissoes: PerfilPermissaoRow[];
}

/**
 * Matriz de permissões por rotina x ação. Lista as rotinas agrupadas por
 * módulo/menu (a mesma estrutura que já existe em Estrutura de Menu) — assim
 * quem está configurando o perfil escolhe pelo nome da tela, sem precisar
 * saber código ou rota de cor.
 */
export function PermissoesMatrix({ perfilId, onSaved }: { perfilId: string; onSaved?: () => void }) {
  const qc = useQueryClient();
  // Estrutura completa (sem filtro de permissão do usuário logado) — a
  // matriz precisa mostrar todas as rotinas, mesmo as que o admin atual
  // não tenha marcado para si mesmo.
  const { data: modulos, isLoading: loadingMenu } = useQuery({
    queryKey: ["modulos", "all"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
  });

  const perfilQuery = useQuery({
    queryKey: ["perfis", perfilId],
    queryFn: () => apiFetch<PerfilDetail>(`/perfis/${perfilId}`),
  });

  const [state, setState] = useState<Record<string, Partial<Record<Acao, boolean>>>>({});

  useEffect(() => {
    if (!perfilQuery.data) return;
    const initial: Record<string, Partial<Record<Acao, boolean>>> = {};
    for (const p of perfilQuery.data.permissoes) {
      initial[p.rotinaId] ??= {};
      initial[p.rotinaId][p.acao] = p.permitido;
    }
    setState(initial);
  }, [perfilQuery.data]);

  const rotinasPorModulo = useMemo(
    () =>
      (modulos ?? []).map((modulo) => ({
        modulo,
        rotinas: modulo.menus.flatMap((menu) =>
          menu.rotinas.map((r) => ({ ...r, menuNome: menu.nome })),
        ),
      })),
    [modulos],
  );

  const toggle = (rotinaId: string, acao: Acao, value: boolean) => {
    setState((prev) => ({ ...prev, [rotinaId]: { ...prev[rotinaId], [acao]: value } }));
  };

  const save = useMutation({
    mutationFn: () => {
      const permissoes = Object.entries(state).flatMap(([rotinaId, acoes]) =>
        Object.entries(acoes).map(([acao, permitido]) => ({
          rotinaId,
          acao: acao as Acao,
          permitido: !!permitido,
        })),
      );
      return apiFetch(`/perfis/${perfilId}/permissoes`, { method: "PUT", body: { permissoes } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["perfis"] });
      toast.success("Permissões salvas");
      onSaved?.();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao salvar permissões"),
  });

  const isLoading = loadingMenu || perfilQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rotinasPorModulo.map(({ modulo, rotinas }) =>
        rotinas.length === 0 ? null : (
          <div key={modulo.id}>
            <p className="mb-2 font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {modulo.nome}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Tela</th>
                    {ACOES.map((acao) => (
                      <th key={acao} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                        {ACAO_LABEL[acao]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rotinas.map((rotina) => (
                    <tr key={rotina.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium">{rotina.nome}</p>
                        <p className="text-xs text-muted-foreground">{rotina.menuNome}</p>
                      </td>
                      {ACOES.map((acao) => (
                        <td key={acao} className="px-2 py-2 text-center">
                          <Checkbox
                            checked={!!state[rotina.id]?.[acao]}
                            onCheckedChange={(v) => toggle(rotina.id, acao, v === true)}
                            aria-label={`${rotina.nome} — ${ACAO_LABEL[acao]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar permissões
        </Button>
      </div>
    </div>
  );
}
