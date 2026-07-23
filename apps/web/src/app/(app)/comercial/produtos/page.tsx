"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Produto } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function ProdutosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [categoria, setCategoria] = useState("");
  const [categoriaInput, setCategoriaInput] = useState("");

  const { data, isLoading, isFetching, refetch } = useResourceList<Produto>("produtos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(categoria ? { categoria } : {}),
  });

  const { remove } = useResourceMutations("produtos");

  const openEdit = (p: Produto) => router.push(`/comercial/produtos/${p.id}`);

  const onDelete = async (p: Produto) => {
    if (!confirm(`Excluir o produto "${p.descricao}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Produto excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir produto");
    }
  };

  const filtrosAtivos = !!categoria;
  const limparFiltros = () => {
    setCategoria("");
    setCategoriaInput("");
    setPage(1);
  };

  const columns: ColumnDef<Produto>[] = [
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
      sortKey: "categoria",
      cell: (p) =>
        p.categoria ? (
          <span>
            {p.categoria}
            {p.subCategoria && (
              <span className="text-muted-foreground"> · {p.subCategoria}</span>
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
            <FieldLabel htmlFor="filtro-categoria">Categoria</FieldLabel>
            <Input
              id="filtro-categoria"
              placeholder="Ex.: COZINHA"
              value={categoriaInput}
              onChange={(e) => setCategoriaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setCategoria(categoriaInput);
                  setPage(1);
                }
              }}
              onBlur={() => {
                setCategoria(categoriaInput);
                setPage(1);
              }}
            />
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
