"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CAMPO_CLIENTE_LABEL,
  ORIGEM_ALTERACAO_CLIENTE_LABEL,
  type ClienteAlteracao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FieldDescription } from "@/components/ui/field";
import { ArrowRight, Check, RefreshCw, X } from "lucide-react";

const valorLegivel = (v: unknown) => {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
};

/**
 * Solicitações pendentes deste cliente, com aprovar (campo a campo) e recusar
 * (com motivo) ali mesmo — sem precisar ir à fila geral. Traz também o botão
 * que consulta o CNPJ na Receita e abre uma solicitação com o que diverge.
 */
export function ClienteAlteracoesPendentes({
  clienteId,
  onAtualizarReceita,
  atualizandoReceita,
  podeConsultarReceita,
}: {
  clienteId: string;
  onAtualizarReceita?: () => Promise<void>;
  atualizandoReceita?: boolean;
  podeConsultarReceita?: boolean;
}) {
  const queryClient = useQueryClient();
  const podeAprovar = useAuthStore((s) => s.hasPermission("clientes", "aprovar"));
  const chave = ["clientes", clienteId, "alteracoes-pendentes"];

  const [selecao, setSelecao] = useState<Record<string, string[]>>({});
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () =>
      apiFetch<{ data: ClienteAlteracao[]; total: number }>("/clientes-alteracoes", {
        query: { status: "pendente", clienteId, pageSize: 50 },
      }),
  });
  const linhas = data?.data ?? [];

  const camposDe = (l: ClienteAlteracao) => Object.keys(l.alteracoes ?? {});
  const marcadosDe = (l: ClienteAlteracao) => selecao[l.id] ?? camposDe(l);
  const alternar = (l: ClienteAlteracao, campo: string) =>
    setSelecao((s) => {
      const atual = s[l.id] ?? camposDe(l);
      return {
        ...s,
        [l.id]: atual.includes(campo) ? atual.filter((c) => c !== campo) : [...atual, campo],
      };
    });

  const depois = () => {
    void queryClient.invalidateQueries({ queryKey: chave });
    void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    void queryClient.invalidateQueries({ queryKey: ["clientes-alteracoes"] });
  };

  const aprovar = useMutation({
    mutationFn: ({ id, campos }: { id: string; campos: string[] }) =>
      apiFetch(`/clientes-alteracoes/${id}/aprovar`, { method: "POST", body: { campos } }),
    onSuccess: () => {
      depois();
      toast.success("Alteração aprovada e aplicada no cadastro");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao aprovar"),
  });

  const recusar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiFetch(`/clientes-alteracoes/${id}/recusar`, { method: "POST", body: { motivo } }),
    onSuccess: () => {
      depois();
      setRecusandoId(null);
      setMotivo("");
      toast.success("Alteração recusada");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao recusar"),
  });

  const consultar = async () => {
    await onAtualizarReceita?.();
    void queryClient.invalidateQueries({ queryKey: chave });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Aguardando análise</h3>
        {podeConsultarReceita && onAtualizarReceita && (
          <Button type="button" variant="outline" size="sm" onClick={consultar} disabled={atualizandoReceita}>
            <RefreshCw className={`size-4 ${atualizandoReceita ? "animate-spin" : ""}`} />
            Atualizar dados da Receita
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : linhas.length === 0 ? (
        <FieldDescription>Nenhuma solicitação pendente para este cliente.</FieldDescription>
      ) : (
        linhas.map((l) => {
          const marcados = marcadosDe(l);
          return (
            <div key={l.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{ORIGEM_ALTERACAO_CLIENTE_LABEL[l.origem]}</Badge>
                <span>{l.solicitadoPorNome ?? "—"}</span>
                {l.justificativa && <span>· {l.justificativa}</span>}
              </div>

              <div className="space-y-1">
                {Object.entries(l.alteracoes ?? {}).map(([campo, { de, para }]) => (
                  <label
                    key={campo}
                    className="flex cursor-pointer flex-wrap items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50"
                  >
                    {podeAprovar && (
                      <Checkbox checked={marcados.includes(campo)} onCheckedChange={() => alternar(l, campo)} />
                    )}
                    <span className="min-w-40 font-medium">{CAMPO_CLIENTE_LABEL[campo] ?? campo}</span>
                    <span className="text-muted-foreground line-through">{valorLegivel(de)}</span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{valorLegivel(para)}</span>
                  </label>
                ))}
              </div>

              {podeAprovar &&
                (recusandoId === l.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Motivo da recusa (obrigatório)"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRecusandoId(null);
                          setMotivo("");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={motivo.trim().length < 3 || recusar.isPending}
                        onClick={() => recusar.mutate({ id: l.id, motivo: motivo.trim() })}
                      >
                        Confirmar recusa
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecusandoId(l.id);
                        setMotivo("");
                      }}
                    >
                      <X className="size-4" />
                      Recusar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={marcados.length === 0 || aprovar.isPending}
                      onClick={() => aprovar.mutate({ id: l.id, campos: marcados })}
                    >
                      <Check className="size-4" />
                      Aprovar{marcados.length < camposDe(l).length ? ` (${marcados.length})` : ""}
                    </Button>
                  </div>
                ))}
            </div>
          );
        })
      )}
    </div>
  );
}
