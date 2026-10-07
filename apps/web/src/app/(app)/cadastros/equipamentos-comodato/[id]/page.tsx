"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { EquipamentoComodatoDetalhe, Produto } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { EquipamentoSugestoes } from "@/components/crud/equipamento-sugestoes";
import { StatusDot } from "@/components/crud/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RECURSO = "equipamentos-comodato";
const LIST_ROUTE = "/cadastros/equipamentos-comodato";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

export default function EquipamentoComodatoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission(RECURSO, "editar"));
  const podeExcluir = useAuthStore((s) => s.hasPermission(RECURSO, "excluir"));

  const [produto, setProduto] = useState<Produto | null>(null);
  const [observacao, setObservacao] = useState("");

  const { data: equipamento, isLoading, isError } = useQuery({
    queryKey: [RECURSO, id],
    queryFn: () => apiFetch<EquipamentoComodatoDetalhe>(`/${RECURSO}/${id}`),
  });

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: [RECURSO] });
  const erro = (padrao: string) => (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : padrao);

  const adicionar = useMutation({
    mutationFn: (input: { produtoId: string; observacao?: string | null }) =>
      apiFetch(`/${RECURSO}/${id}/aplicacoes`, { method: "POST", body: input }),
    onSuccess: () => {
      toast.success("Produto aplicável adicionado");
      setProduto(null);
      setObservacao("");
      invalidar();
    },
    onError: erro("Não foi possível adicionar"),
  });

  const remover = useMutation({
    mutationFn: (relacaoId: string) =>
      apiFetch(`/${RECURSO}/${id}/aplicacoes/${relacaoId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Produto aplicável removido");
      invalidar();
    },
    onError: erro("Não foi possível remover"),
  });

  const alterarAtivo = useMutation({
    mutationFn: (ativo: boolean) =>
      apiFetch(`/${RECURSO}/${id}`, { method: "PATCH", body: { ativo } }),
    onSuccess: () => invalidar(),
    onError: erro("Não foi possível alterar"),
  });

  const excluir = useMutation({
    mutationFn: () => apiFetch(`/${RECURSO}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Equipamento excluído");
      invalidar();
      router.push(LIST_ROUTE);
    },
    onError: erro("Não foi possível excluir"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !equipamento) {
    return <p className="text-sm text-muted-foreground">Equipamento não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{equipamento.produto.descricao}</h1>
        {!equipamento.ativo && <Badge variant="destructive">Inativo</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {podeExcluir && (
            <Button
              variant="outline"
              disabled={excluir.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Excluir este equipamento do cadastro? Os produtos aplicáveis continuam no produto e voltam se ele for cadastrado de novo.",
                  )
                )
                  excluir.mutate();
              }}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Info label="Código" value={<span className="font-mono">{equipamento.produto.codigoErp}</span>} />
          <Info label="Categoria" value={equipamento.produto.categoria ?? "—"} />
          <Info label="Unidade" value={equipamento.produto.unidade ?? "—"} />
          <Info label="Clientes que já receberam" value={equipamento.totalClientes} />
          <Info
            label="Ativo"
            value={
              podeEditar ? (
                <Switch
                  checked={equipamento.ativo}
                  disabled={alterarAtivo.isPending}
                  onCheckedChange={(v) => alterarAtivo.mutate(v)}
                />
              ) : (
                <StatusDot active={equipamento.ativo} />
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Produtos aplicáveis ({equipamento.aplicacoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {podeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-96">
                <ProdutoCombobox
                  value={produto?.id ?? null}
                  onChange={setProduto}
                  placeholder="Escolher produto aplicável"
                />
              </div>
              <Input
                className="w-full sm:w-64"
                placeholder="Observação (ex.: dose de 20 ml)"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
              <Button
                disabled={!produto || adicionar.isPending}
                onClick={() =>
                  produto &&
                  adicionar.mutate({ produtoId: produto.id, observacao: observacao.trim() || null })
                }
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>
          )}

          {equipamento.aplicacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto aplicável cadastrado. Veja as sugestões abaixo.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Observação</TableHead>
                    {podeEditar && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipamento.aplicacoes.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.produto.codigoErp}</TableCell>
                      <TableCell>
                        {a.produto.descricao}
                        {!a.produto.ativo && (
                          <Badge variant="outline" className="ml-2">
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{a.produto.categoria ?? "—"}</TableCell>
                      <TableCell className="text-xs">{a.observacao ?? "—"}</TableCell>
                      {podeEditar && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remover"
                            disabled={remover.isPending}
                            onClick={() => remover.mutate(a.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EquipamentoSugestoes equipamentoId={id} podeEditar={podeEditar} />
    </div>
  );
}
