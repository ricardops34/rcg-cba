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

type ProdutoRow = Produto & {
  categoria?: { id: string; descricao: string } | null;
  subCategoria?: { id: string; descricao: string } | null;
  fabricante?: { id: string; razaoSocial: string; nomeFantasia?: string | null } | null;
};

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
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [categoriaId, setCategoriaId] = useState<string | undefined>(undefined);

  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<ProdutoRow>("produtos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(categoriaId ? { categoriaId } : {}),
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
    {
      header: "Origem",
      // Quem tem chave de integração é espelho do Protheus: o import regrava, e
      // por isso a edição desses campos fica bloqueada.
      cell: (p) =>
        p.chave ? (
          <Badge variant="secondary" title={`Chave de integração ${p.chave}`}>
            ERP
          </Badge>
        ) : (
          <Badge variant="outline">Plataforma</Badge>
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
            active={!!categoriaId}
            onClear={() => {
              setCategoriaId(undefined);
              setPage(1);
            }}
          >
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
