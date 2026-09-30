"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GrupoContexto, GrupoUsuario, Perfil } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Acesso {
  perfilId: string;
  empresas: string[];
}

/** Grupo da empresa ativa, quando ela pertence a um. */
export function useGrupoDaEmpresaAtiva() {
  const user = useAuthStore((s) => s.user);
  const query = useQuery({
    queryKey: ["grupos-economicos", user?.id, user?.empresaAtivaId],
    queryFn: () => apiFetch<GrupoContexto>("/grupos-economicos"),
  });
  const grupo = query.data?.grupos.find((g) => g.empresas.some((e) => e.id === user?.empresaAtivaId));
  return { grupo, isLoading: query.isLoading };
}

/**
 * Empresas do grupo econômico a que o usuário tem acesso, marcadas no próprio
 * cadastro do usuário. Hierarquia Grupo econômico → Empresa, e o **perfil é do
 * usuário no grupo**, não por empresa (decisão de 30/09/2026): um só perfil,
 * aplicado a todas as empresas marcadas.
 *
 * Grava pela API do grupo (`/grupos-economicos/:id/usuarios`), que confere a
 * empresa, o grupo, o limite de usuários, o perfil restrito da plataforma e
 * recusa perfis diferentes entre as empresas.
 */
export function UsuarioEmpresasGrupo({ usuarioId }: { usuarioId: string }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { grupo, isLoading } = useGrupoDaEmpresaAtiva();
  const [edicao, setEdicao] = useState<{ base: string; valor: Acesso } | null>(null);

  const usuarios = useQuery({
    queryKey: ["grupo-usuarios", grupo?.id, user?.id],
    queryFn: () => apiFetch<GrupoUsuario[]>(`/grupos-economicos/${grupo!.id}/usuarios`),
    enabled: !!grupo,
  });
  const perfis = useQuery({
    queryKey: ["perfis", "grupo", user?.empresaAtivaId],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100, ativo: true } }),
    enabled: !!grupo,
  });

  const doGrupo = usuarios.data?.find((u) => u.id === usuarioId);
  const ativos = (doGrupo?.vinculos ?? []).filter((v) => v.ativo);
  const salvo: Acesso = { perfilId: ativos[0]?.perfilId ?? "", empresas: ativos.map((v) => v.empresaId).sort() };
  const base = JSON.stringify(salvo);
  // A edição local vale enquanto o dado salvo não mudar; depois de salvar (ou
  // recarregar), volta a partir do servidor.
  const acesso = edicao?.base === base ? edicao.valor : salvo;
  const editar = (valor: Acesso) => setEdicao({ base, valor: { ...valor, empresas: [...valor.empresas].sort() } });

  const salvar = useMutation({
    mutationFn: async () => {
      if (acesso.empresas.length) {
        await apiFetch(`/grupos-economicos/${grupo!.id}/usuarios`, {
          method: "POST",
          body: {
            usuarioId,
            vinculos: acesso.empresas.map((empresaId) => ({ empresaId, perfilId: acesso.perfilId })),
          },
        });
      }
      for (const empresaId of salvo.empresas.filter((id) => !acesso.empresas.includes(id))) {
        await apiFetch(`/grupos-economicos/${grupo!.id}/usuarios/${usuarioId}/empresas/${empresaId}`, { method: "DELETE" });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["grupo-usuarios"] }),
        qc.invalidateQueries({ queryKey: ["usuarios", usuarioId] }),
      ]);
      toast.success("Acesso às empresas atualizado");
    },
    onError: async (e) => {
      await qc.invalidateQueries({ queryKey: ["grupo-usuarios"] });
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar o acesso");
    },
  });

  if (isLoading || !grupo) return null;

  const perfisPermitidos = perfis.data?.data.filter((p) => !p.administraPlataforma || user?.administradorPlataforma);
  const mudou = JSON.stringify(acesso) !== base;
  const removidas = salvo.empresas.filter((id) => !acesso.empresas.includes(id));

  return (
    <div className="space-y-3">
      <FieldLabel>Perfil e empresas do usuário</FieldLabel>
      {usuarios.isSuccess && !doGrupo ? (
        <p className="text-sm text-muted-foreground">Este usuário não pertence ao grupo econômico.</p>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="perfil-grupo" className="text-xs">Perfil</FieldLabel>
            <Select value={acesso.perfilId} onValueChange={(perfilId) => editar({ ...acesso, perfilId })}>
              <SelectTrigger id="perfil-grupo" className="w-full sm:w-72">
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                {perfisPermitidos?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Vale em todas as empresas marcadas abaixo.</FieldDescription>
          </Field>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Empresas com acesso · {grupo.descricao}</p>
            {grupo.empresas.map((e) => (
              <label key={e.id} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm">
                <Checkbox
                  checked={acesso.empresas.includes(e.id)}
                  disabled={e.id === user?.empresaAtivaId && usuarioId === user?.id}
                  onCheckedChange={(v) =>
                    editar({
                      ...acesso,
                      empresas: v ? [...acesso.empresas, e.id] : acesso.empresas.filter((id) => id !== e.id),
                    })
                  }
                />
                {e.nomeFantasia}
              </label>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!mudou || !acesso.perfilId || salvar.isPending}
            onClick={() => {
              if (removidas.length && !confirm("Remover o acesso às empresas desmarcadas?")) return;
              salvar.mutate();
            }}
          >
            {salvar.isPending ? "Salvando…" : "Salvar perfil e empresas"}
          </Button>
        </>
      )}
    </div>
  );
}
