"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Categoria } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Badge } from "@/components/ui/badge";
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
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [nivel, setNivel] = useState<"todos" | "raiz">("todos");
  const [categoriaPaiId, setCategoriaPaiId] = useState<string | undefined>(undefined);

  const raizesQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<CategoriaRow>("categorias", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(nivel === "raiz" ? { raiz: true } : {}),
    ...(categoriaPaiId ? { categoriaPaiId } : {}),
  });

  const { remove } = useResourceMutations("categorias");

  const openEdit = (c: CategoriaRow) => router.push(`/cadastros/categorias/${c.id}`);

  const onDelete = async (c: CategoriaRow) => {
    if (!confirm(`Excluir a categoria "${c.descricao}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Categoria excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir categoria");
    }
  };

  const filtrosAtivos = nivel !== "todos" || !!categoriaPaiId;

  const limparFiltros = () => {
    setNivel("todos");
    setCategoriaPaiId(undefined);
    setPage(1);
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
      cell: (c) => <span className="text-xs">{c.categoriaPaiId ? "Subcategoria" : "Categoria"}</span>,
    },
    {
      header: "Usada",
      cell: (c) => <span className="text-xs">{c.usado == null ? "—" : c.usado ? "Sim" : "Não"}</span>,
    },
    { header: "Status", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
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
        onCreate={() => router.push("/cadastros/categorias/novo")}
        createLabel="Nova categoria"
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
                setNivel(v as "todos" | "raiz");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="raiz">Só categorias raiz</SelectItem>
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
