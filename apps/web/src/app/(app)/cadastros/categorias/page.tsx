"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Switch } from "@/components/ui/switch";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CategoriaRow = Categoria & {
  categoriaPai?: { id: string; codigoErp: string; descricao: string } | null;
};

export default function CategoriasPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [nivel, setNivel] = useState<"todos" | "raiz" | "sub">("todos");
  const [categoriaPaiId, setCategoriaPaiId] = useState<string | undefined>(undefined);

  const raizesQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<CategoriaRow>("categorias", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(nivel === "raiz" ? { raiz: true } : {}),
    ...(nivel === "sub" ? { raiz: false } : {}),
    ...(categoriaPaiId ? { categoriaPaiId } : {}),
  });

  const abrirDetalhe = (c: CategoriaRow) => router.push(`/cadastros/categorias/${c.id}`);

  const filtrosAtivos = nivel !== "todos" || !!categoriaPaiId;

  const limparFiltros = () => {
    setNivel("todos");
    setCategoriaPaiId(undefined);
    setPage(1);
  };

  // Marcar/desmarcar "Usada" — o único campo que esta tela grava; o resto do
  // cadastro vem do import do ERP.
  const podeEditar = Boolean(
    useAuthStore((s) => s.user?.permissoes)?.includes("categorias.editar"),
  );
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const alternarUsado = async (c: CategoriaRow, valor: boolean) => {
    setSalvandoId(c.id);
    try {
      await apiFetch(`/categorias/${c.id}`, {
        method: "PATCH",
        body: { usado: valor },
      });
      await refetch();
      toast.success(
        valor
          ? `"${c.descricao}" passa a aparecer no Dashboard Comercial`
          : `"${c.descricao}" sai do Dashboard Comercial`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSalvandoId(null);
    }
  };

  const columns: ColumnDef<CategoriaRow>[] = [
    {
      header: "Descrição",
      sortKey: "descricao",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <p className="font-medium">{c.descricao}</p>
          {c.categoriaPai && <Badge variant="outline">{c.categoriaPai.descricao}</Badge>}
        </div>
      ),
    },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp}</span>,
    },
    {
      header: "Nível",
      sortKey: "categoriaPaiId",
      cell: (c) => <span className="text-xs">{c.categoriaPaiId ? "Subcategoria" : "Categoria"}</span>,
    },
    {
      header: "Usada",
      sortKey: "usado",
      // Editável na própria linha: marcar categoria é um vaivém de "esta sim,
      // esta não" — abrir o detalhe de cada uma para um clique seria pior.
      // Subcategoria fica de fora: a marcação é só de categoria raiz, e é ela
      // que o Dashboard Comercial usa.
      cell: (c) =>
        podeEditar && !c.categoriaPaiId ? (
          <Switch
            checked={c.usado === true}
            disabled={salvandoId === c.id}
            onClick={(ev) => ev.stopPropagation()}
            onCheckedChange={(v) => alternarUsado(c, v)}
            aria-label={`Marcar ${c.descricao} como usada`}
          />
        ) : (
          <span className="text-xs">{c.usado == null ? "—" : c.usado ? "Sim" : "Não"}</span>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Nível</FieldLabel>
            <Select
              value={nivel}
              onValueChange={(v) => {
                setNivel(v as "todos" | "raiz" | "sub");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="raiz">Categoria</SelectItem>
                <SelectItem value="sub">Subcategoria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Categoria pai</FieldLabel>
            <Select
              value={categoriaPaiId ?? "none"}
              onValueChange={(v) => {
                setCategoriaPaiId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Qualquer</SelectItem>
                {(raizesQuery.data?.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersPopover>
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
        emptyMessage="Nenhuma categoria cadastrada."
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
