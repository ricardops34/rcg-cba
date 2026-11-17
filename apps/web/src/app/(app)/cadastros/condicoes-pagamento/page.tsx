"use client";

import { useTamanhoPagina } from "@/hooks/use-tamanho-pagina";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CondicaoPagamento } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

export default function CondicoesPagamentoPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTamanhoPagina(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  // Filtro rápido da marcação "Usar no orçamento".
  const [noOrcamento, setNoOrcamento] = useState<boolean | undefined>(undefined);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<CondicaoPagamento>(
    "condicoes-pagamento",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
      ...(noOrcamento !== undefined ? { usadoOrcamento: noOrcamento } : {}),
    },
  );

  // "Usar no orçamento" (17/11/2026) — o único campo que esta tela grava; o
  // resto do cadastro vem do import do ERP. Mesmo desenho do "Usada" da
  // categoria: chave na própria linha.
  const podeEditar = Boolean(
    useAuthStore((s) => s.user?.permissoes)?.includes("condicoes-pagamento.editar"),
  );
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const alternarOrcamento = async (c: CondicaoPagamento, valor: boolean) => {
    setSalvandoId(c.id);
    try {
      await apiFetch(`/condicoes-pagamento/${c.id}`, {
        method: "PATCH",
        body: { usadoOrcamento: valor },
      });
      await refetch();
      toast.success(
        valor
          ? `"${c.descricao}" passa a aparecer no orçamento`
          : `"${c.descricao}" sai da escolha do orçamento`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSalvandoId(null);
    }
  };

  const abrirDetalhe = (c: CondicaoPagamento) => router.push(`/cadastros/condicoes-pagamento/${c.id}`);

  const columns: ColumnDef<CondicaoPagamento>[] = [
    { header: "Descrição", sortKey: "descricao", cell: (c) => <p className="font-medium">{c.descricao}</p> },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp}</span>,
    },
    { header: "Forma", sortKey: "forma", cell: (c) => <span className="text-xs">{c.forma || "—"}</span> },
    {
      header: "Usar no orçamento",
      sortKey: "usadoOrcamento",
      cell: (c) =>
        podeEditar ? (
          <Switch
            checked={c.usadoOrcamento}
            disabled={salvandoId === c.id}
            onClick={(ev) => ev.stopPropagation()}
            onCheckedChange={(v) => alternarOrcamento(c, v)}
            aria-label={`Usar ${c.descricao} no orçamento`}
          />
        ) : (
          <span className="text-xs">{c.usadoOrcamento ? "Sim" : "Não"}</span>
        ),
    },
    { header: "Status", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
  ];

  return (
    <div className="space-y-4">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <QuickFilterGroup>
          {(
            [
              [undefined, "Todas"],
              [true, "Usadas no orçamento"],
              [false, "Fora do orçamento"],
            ] as const
          ).map(([valor, rotulo]) => (
            <QuickFilterButton
              key={rotulo}
              active={noOrcamento === valor}
              onClick={() => {
                setNoOrcamento(valor);
                setPage(1);
              }}
            >
              {rotulo}
            </QuickFilterButton>
          ))}
        </QuickFilterGroup>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
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
        onRowClick={abrirDetalhe}
        emptyMessage="Nenhuma condição de pagamento cadastrada."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />
    </div>
  );
}
