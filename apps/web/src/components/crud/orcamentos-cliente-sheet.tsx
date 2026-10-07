"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cliente, Orcamento, OrcamentoUpdate, StatusOrcamento } from "@plataforma/contracts";
import { numeroOrcamento } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { useAuthStore } from "@/stores/auth-store";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { OrcamentoSheet, type OrcamentoSheetAlvo } from "@/components/crud/orcamento-form";
import { STATUS_ORCAMENTO_LABEL, STATUS_ORCAMENTO_VARIANT } from "@/components/crud/orcamento-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CircleCheck, CircleX, Copy, Eye, MoreHorizontal, Pencil, Plus } from "lucide-react";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Aprovado e vencido não se alteram (o servidor recusa com 409): abrem só
// para visualizar, e o caminho para reaproveitá-los é copiar.
const somenteLeitura = (s: StatusOrcamento) => s === "aprovado" || s === "expirado";

/**
 * Cortina com os últimos orçamentos de um cliente (Posição de Cliente). O
 * formulário — incluir, visualizar/editar, copiar — abre numa segunda
 * cortina por cima desta, e ao fechar volta para a listagem.
 *
 * Esconder as ações é só para não oferecer o que vai voltar 403/409: a rota
 * confere permissão e status de novo, e aprovar com desconto acima do máximo
 * sem autorização é recusado lá (a mensagem do servidor vira o aviso).
 */
export function OrcamentosClienteSheet({
  clienteId,
  onOpenChange,
}: {
  clienteId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState<OrcamentoSheetAlvo | null>(null);

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const podeCadastrar = hasPermission("orcamentos", "cadastrar");
  const podeEditar = hasPermission("orcamentos", "editar");

  // Mesma chave do ClienteCombobox/formulário — reaproveita o cache.
  const clienteQuery = useQuery({
    queryKey: ["clientes", clienteId],
    queryFn: () => apiFetch<Cliente>(`/clientes/${clienteId}`),
    enabled: !!clienteId,
  });
  const cliente = clienteQuery.data;

  const { data, isLoading, error } = useResourceList<Orcamento>("orcamentos", {
    clienteId: clienteId ?? undefined,
    ativo: true,
    page,
    pageSize,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const { update } = useResourceMutations<never, OrcamentoUpdate>("orcamentos");

  const mudarStatus = async (o: Orcamento, status: "aprovado" | "recusado") => {
    const acao = status === "aprovado" ? "Aprovar" : "Reprovar";
    if (!confirm(`${acao} o orçamento Nº ${numeroOrcamento(o)} — "${o.titulo}"?`)) return;
    try {
      await update.mutateAsync({ id: o.id, input: { status } });
      // A aprovação/recusa vira evento no histórico do cliente.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      toast.success(status === "aprovado" ? "Orçamento aprovado" : "Orçamento reprovado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Erro ao ${acao.toLowerCase()} orçamento`);
    }
  };

  const fechar = (open: boolean) => {
    if (open) return;
    setPage(1);
    setForm(null);
    onOpenChange(false);
  };

  const columns: ColumnDef<Orcamento>[] = [
    {
      header: "Nº",
      className: "w-16",
      cell: (o) => <span className="font-mono text-xs">{numeroOrcamento(o)}</span>,
    },
    {
      header: "Data",
      cell: (o) => dataCivilBr(o.createdAt),
    },
    {
      header: "Título",
      className: "whitespace-normal",
      cell: (o) => <span className="block max-w-56 font-medium">{o.titulo}</span>,
    },
    {
      header: "Status",
      cell: (o) => <Badge variant={STATUS_ORCAMENTO_VARIANT[o.status]}>{STATUS_ORCAMENTO_LABEL[o.status]}</Badge>,
    },
    {
      header: "Total",
      className: "text-right",
      cell: (o) => moeda(o.vlrTotal),
    },
    {
      header: "Válido até",
      cell: (o) => dataCivilBr(o.dataValidade),
    },
    {
      header: "",
      className: "w-10",
      cell: (o) => {
        const editavel = podeEditar && !somenteLeitura(o.status);
        const podeAprovar = editavel;
        const podeReprovar = editavel && o.status !== "recusado";
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setForm({ modo: "editar", id: o.id })}>
                {editavel ? (
                  <>
                    <Pencil className="size-4" /> Editar
                  </>
                ) : (
                  <>
                    <Eye className="size-4" /> Visualizar
                  </>
                )}
              </DropdownMenuItem>
              {podeCadastrar && (
                <DropdownMenuItem onClick={() => setForm({ modo: "copiar", id: o.id })}>
                  <Copy className="size-4" /> Copiar
                </DropdownMenuItem>
              )}
              {(podeAprovar || podeReprovar) && <DropdownMenuSeparator />}
              {podeAprovar && (
                <DropdownMenuItem onClick={() => mudarStatus(o, "aprovado")}>
                  <CircleCheck className="size-4" /> Aprovar
                </DropdownMenuItem>
              )}
              {podeReprovar && (
                <DropdownMenuItem variant="destructive" onClick={() => mudarStatus(o, "recusado")}>
                  <CircleX className="size-4" /> Reprovar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <Sheet open={!!clienteId} onOpenChange={fechar}>
        <ResizableSheetContent defaultWidth={760} storageKey="plataforma-cortina-largura-orcamentos-cliente">
          <SheetHeader className="flex-row items-start justify-between gap-3 pr-12">
            <div className="space-y-1">
              <SheetTitle>Orçamentos do cliente</SheetTitle>
              <SheetDescription>
                {cliente ? cliente.nomeFantasia || cliente.razaoSocial : " "}
              </SheetDescription>
            </div>
            {podeCadastrar && clienteId && (
              <Button size="sm" onClick={() => setForm({ modo: "novo", clienteId })}>
                <Plus className="size-4" /> Incluir
              </Button>
            )}
          </SheetHeader>
          <div className="px-4 pb-4">
            <EntityTable
              columns={columns}
              rows={data?.data ?? []}
              rowKey={(o) => o.id}
              isLoading={isLoading}
              error={error}
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? pageSize}
              total={data?.total ?? 0}
              totalPages={data?.totalPages ?? 1}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              onRowClick={(o) => setForm({ modo: "editar", id: o.id })}
              emptyMessage="Nenhum orçamento para este cliente."
              storageKey="orcamentos-cliente"
            />
          </div>
        </ResizableSheetContent>
      </Sheet>

      {/* Segunda cortina, por cima da listagem. */}
      <OrcamentoSheet alvo={form} onOpenChange={(open) => !open && setForm(null)} />
    </>
  );
}
