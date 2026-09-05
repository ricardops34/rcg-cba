"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProdutoCampoValor } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/**
 * Dados complementares do produto — os campos que a empresa criou em
 * Administração > Campos do Produto.
 *
 * É a **única** parte editável do cadastro de produto: o resto vem do ERP e é
 * sobrescrito na próxima carga. O que se digita aqui vive em tabela própria e
 * sobrevive ao import.
 *
 * Sem campo definido, o card não aparece — nem como um vazio explicando que
 * está vazio. Quem nunca vai usar isto não deve nem saber que existe.
 */

const SEM_GRUPO = "Dados complementares";

/** O que a API devolve é o canônico; a tela mostra em português. */
function exibir(linha: ProdutoCampoValor): string {
  if (linha.valor === null) return "—";
  if (linha.tipo === "booleano") return linha.valor === "true" ? "Sim" : "Não";
  if (linha.tipo === "data") {
    const [ano, mes, dia] = linha.valor.split("-");
    return `${dia}/${mes}/${ano}`;
  }
  if (linha.tipo === "numero") {
    const n = Number(linha.valor);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR") : linha.valor;
  }
  return linha.valor;
}

export function ProdutoCamposCard({
  produtoId,
  permitirEdicao = false,
}: {
  produtoId: string;
  permitirEdicao?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["produtos", produtoId, "campos"],
    queryFn: () =>
      apiFetch<ProdutoCampoValor[]>(`/produtos/${produtoId}/campos`),
  });

  // O rascunho nasce do que está gravado a cada vez que a edição abre — senão
  // cancelar e reabrir traria o que foi digitado e descartado.
  useEffect(() => {
    if (editando && linhas) {
      setRascunho(
        Object.fromEntries(linhas.map((l) => [l.campoId, l.valor ?? ""])),
      );
    }
  }, [editando, linhas]);

  const salvar = useMutation({
    mutationFn: (valores: Record<string, string>) =>
      apiFetch(`/produtos/${produtoId}/campos`, {
        method: "PATCH",
        body: {
          valores: Object.entries(valores).map(([campoId, valor]) => ({
            campoId,
            valor: valor.trim() ? valor : null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Dados complementares salvos");
      setEditando(false);
      void queryClient.invalidateQueries({
        queryKey: ["produtos", produtoId, "campos"],
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível salvar",
      ),
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, ProdutoCampoValor[]>();
    for (const l of linhas ?? []) {
      const chave = l.grupo?.trim() || SEM_GRUPO;
      mapa.set(chave, [...(mapa.get(chave) ?? []), l]);
    }
    return [...mapa.entries()];
  }, [linhas]);

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!linhas || linhas.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Dados complementares</p>
          {permitirEdicao &&
            (editando ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditando(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={salvar.isPending}
                  onClick={() => salvar.mutate(rascunho)}
                >
                  Salvar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditando(true)}
              >
                Editar
              </Button>
            ))}
        </div>

        {grupos.map(([grupo, doGrupo]) => (
          <div key={grupo} className="space-y-3">
            {grupos.length > 1 && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {grupo}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((linha) => (
                <div key={linha.campoId} className="space-y-1">
                  <FieldLabel htmlFor={`campo-${linha.campoId}`}>
                    {linha.nome}
                    {linha.unidade && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({linha.unidade})
                      </span>
                    )}
                    {linha.obrigatorio && (
                      <span className="text-destructive"> *</span>
                    )}
                  </FieldLabel>

                  {!editando ? (
                    <p className="text-sm">{exibir(linha)}</p>
                  ) : linha.tipo === "booleano" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={rascunho[linha.campoId] === "true"}
                        onCheckedChange={(v) =>
                          setRascunho((r) => ({
                            ...r,
                            [linha.campoId]: v ? "true" : "false",
                          }))
                        }
                      />
                      Sim
                    </label>
                  ) : linha.tipo === "lista" ? (
                    <Select
                      value={rascunho[linha.campoId] || "vazio"}
                      onValueChange={(v) =>
                        setRascunho((r) => ({
                          ...r,
                          [linha.campoId]: v === "vazio" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vazio">—</SelectItem>
                        {linha.opcoes.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : linha.tipo === "texto_longo" ? (
                    <Textarea
                      id={`campo-${linha.campoId}`}
                      rows={3}
                      value={rascunho[linha.campoId] ?? ""}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          [linha.campoId]: e.target.value,
                        }))
                      }
                    />
                  ) : (
                    <Input
                      id={`campo-${linha.campoId}`}
                      type={linha.tipo === "data" ? "date" : "text"}
                      inputMode={linha.tipo === "numero" ? "decimal" : undefined}
                      value={rascunho[linha.campoId] ?? ""}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          [linha.campoId]: e.target.value,
                        }))
                      }
                    />
                  )}

                  {editando && linha.ajuda && (
                    <p className="text-xs text-muted-foreground">
                      {linha.ajuda}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
