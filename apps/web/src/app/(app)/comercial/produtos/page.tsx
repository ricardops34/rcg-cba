"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Categoria, Produto } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type ProdutoRow = Produto & {
  categoria?: { id: string; descricao: string } | null;
  subCategoria?: { id: string; descricao: string } | null;
  armazem?: { id: string; descricao: string } | null;
};

export default function ProdutosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [categoriaId, setCategoriaId] = useState<string | undefined>(undefined);

  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<ProdutoRow>("produtos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(categoriaId ? { categoriaId } : {}),
  });

  const { remove } = useResourceMutations("produtos");

  const openEdit = (p: ProdutoRow) => router.push(`/comercial/produtos/${p.id}`);

  const onDelete = async (p: ProdutoRow) => {
    if (!confirm(`Excluir o produto "${p.descricao}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Produto excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir produto");
    }
  };

  const filtrosAtivos = !!categoriaId;
  const limparFiltros = () => {
    setCategoriaId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<ProdutoRow>[] = [
    { header: "Código", sortKey: "codigoErp", cell: (p) => <span className="font-mono text-xs">{p.codigoErp}</span> },
    {
      header: "Produto",
      sortKey: "descricao",
      cell: (p) => (
        <div>
          <p className="font-medium">{p.descricao}</p>
          {p.marca && <p className="text-xs text-muted-foreground">{p.marca}</p>}
        </div>
      ),
    },
    {
      header: "Categoria",
      cell: (p) =>
        p.categoria ? (
          <span>
            {p.categoria.descricao}
            {p.subCategoria && (
              <span className="text-muted-foreground"> · {p.subCategoria.descricao}</span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    { header: "Unidade", cell: (p) => p.unidade || "—" },
    {
      header: "Últ. preço",
      sortKey: "ultimoPreco",
      cell: (p) =>
        p.ultimoPreco != null
          ? p.ultimoPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "—",
    },
    { header: "Status", sortKey: "ativo", cell: (p) => <StatusDot active={p.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(p)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
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
        onCreate={() => router.push("/comercial/produtos/novo")}
        createLabel="Novo produto"
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
            <FieldLabel>Categoria</FieldLabel>
            <Select
              value={categoriaId ?? "none"}
              onValueChange={(v) => {
                setCategoriaId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas</SelectItem>
                {(categoriasQuery.data?.data ?? []).map((c) => (
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
        rowKey={(p) => p.id}
        isLoading={isLoading}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={openEdit}
        emptyMessage="Nenhum produto cadastrado."
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
