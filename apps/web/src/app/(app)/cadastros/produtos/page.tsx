"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Produto } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FilterMultiSelect } from "@/components/crud/filter-multi-select";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type ProdutoRow = Produto & {
  categoria?: { id: string; codigoErp: string; descricao: string } | null;
  subCategoria?: { id: string; descricao: string } | null;
  fabricante?: { id: string; razaoSocial: string; nomeFantasia?: string | null } | null;
};

interface ProdutoOpcoesFiltro {
  categorias: { id: string; codigoErp: string; descricao: string }[];
  fabricantes: {
    id: string;
    codigoErp: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
  }[];
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Manutenção do cadastro de produtos (módulo Cadastros, rotina
 * `produtos-cadastro`). A lista do Comercial (`/comercial/produtos`, rotina
 * `produtos`) é a de consulta do vendedor — mesma base, papéis diferentes.
 */
export default function ProdutosCadastroPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [fabricanteIds, setFabricanteIds] = useState<string[]>([]);

  const opcoesQuery = useQuery({
    queryKey: ["produtos", "opcoes-filtro"],
    queryFn: () => apiFetch<ProdutoOpcoesFiltro>("/produtos/opcoes-filtro"),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<ProdutoRow>("produtos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(categoriaIds.length > 0 ? { categoriaIds: categoriaIds.join(",") } : {}),
    ...(fabricanteIds.length > 0 ? { fabricanteIds: fabricanteIds.join(",") } : {}),
  });

  const { remove } = useResourceMutations("produtos");

  const openEdit = (p: ProdutoRow) => router.push(`/cadastros/produtos/${p.id}`);

  const onDelete = async (p: ProdutoRow) => {
    if (!confirm(`Excluir o produto "${p.descricao}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Produto excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir produto");
    }
  };

  const columns: ColumnDef<ProdutoRow>[] = [
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (p) => <span className="font-mono text-xs">{p.codigoErp}</span>,
    },
    {
      header: "Descrição",
      sortKey: "descricao",
      cell: (p) => <span className="font-medium">{p.descricao}</span>,
    },
    {
      header: "Fabricante",
      cell: (p) => (
        <span className="text-xs">
          {p.fabricante?.nomeFantasia || p.fabricante?.razaoSocial || p.fabricanteChave || "—"}
          {p.codigoFabricante && (
            <span className="text-muted-foreground font-mono ml-1">({p.codigoFabricante})</span>
          )}
        </span>
      ),
    },
    {
      header: "Categoria",
      cell: (p) =>
        p.categoria ? (
          <span className="text-xs">
            {p.categoria.descricao}
            {p.subCategoria && (
              <span className="text-muted-foreground"> · {p.subCategoria.descricao}</span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    { header: "Marca", sortKey: "marca", cell: (p) => <span className="text-xs">{p.marca || "—"}</span> },
    {
      header: "Último preço",
      sortKey: "ultimoPreco",
      className: "text-right",
      cell: (p) => (
        <span className="text-xs tabular-nums">
          {p.ultimoPreco != null ? moeda.format(p.ultimoPreco) : "—"}
        </span>
      ),
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
              <Pencil className="size-4" /> {p.chave ? "Abrir" : "Editar"}
            </DropdownMenuItem>
            {!p.chave && (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
                <Trash2 className="size-4" /> Excluir
              </DropdownMenuItem>
            )}
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
        onCreate={() => router.push("/cadastros/produtos/novo")}
        createLabel="Novo produto"
        actions={
          <FiltersPopover
            active={categoriaIds.length > 0 || fabricanteIds.length > 0}
            onClear={() => {
              setCategoriaIds([]);
              setFabricanteIds([]);
              setPage(1);
            }}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <FieldLabel>Categoria</FieldLabel>
                <FilterMultiSelect
                  value={categoriaIds}
                  onChange={(ids) => {
                    setCategoriaIds(ids);
                    setPage(1);
                  }}
                  options={(opcoesQuery.data?.categorias ?? []).map((categoria) => ({
                    value: categoria.id,
                    label: `${categoria.codigoErp} · ${categoria.descricao}`,
                  }))}
                  placeholder="Todas as categorias"
                  searchPlaceholder="Buscar categoria..."
                  emptyMessage="Nenhuma categoria encontrada."
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Fabricante</FieldLabel>
                <FilterMultiSelect
                  value={fabricanteIds}
                  onChange={(ids) => {
                    setFabricanteIds(ids);
                    setPage(1);
                  }}
                  options={(opcoesQuery.data?.fabricantes ?? []).map((fabricante) => {
                    const nome = fabricante.nomeFantasia || fabricante.razaoSocial;
                    return {
                      value: fabricante.id,
                      label: fabricante.codigoErp ? `${fabricante.codigoErp} · ${nome}` : nome,
                      searchText: fabricante.razaoSocial,
                    };
                  })}
                  placeholder="Todos os fabricantes"
                  searchPlaceholder="Buscar fabricante..."
                  emptyMessage="Nenhum fabricante encontrado."
                />
              </div>
            </div>
          </FiltersPopover>
        }
      />

      <StatusQuickFilter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(p) => p.id}
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
