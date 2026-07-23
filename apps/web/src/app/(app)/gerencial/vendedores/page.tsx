"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Vendedor } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type SimNaoTodos = "todos" | "sim" | "nao";

export default function VendedoresPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [papeis, setPapeis] = useState<{ vendedor: boolean; supervisor: boolean; gerente: boolean }>({
    vendedor: false,
    supervisor: false,
    gerente: false,
  });
  const [desligado, setDesligado] = useState<SimNaoTodos>("todos");
  const [supervisorId, setSupervisorId] = useState<string | undefined>(undefined);

  const supervisoresQuery = useQuery({
    queryKey: ["vendedores", "select", "supervisores"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[] }>("/vendedores", { query: { pageSize: 100, supervisor: true } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<Vendedor>("vendedores", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(papeis.vendedor ? { vendedor: true } : {}),
    ...(papeis.supervisor ? { supervisor: true } : {}),
    ...(papeis.gerente ? { gerente: true } : {}),
    ...(desligado !== "todos" ? { desligado: desligado === "sim" } : {}),
    ...(supervisorId ? { supervisorId } : {}),
  });

  const { remove } = useResourceMutations("vendedores");

  const openEdit = (v: Vendedor) => router.push(`/gerencial/vendedores/${v.id}`);

  const onDelete = async (v: Vendedor) => {
    if (!confirm(`Excluir o vendedor "${v.nome}"?`)) return;
    try {
      await remove.mutateAsync(v.id);
      toast.success("Vendedor excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir vendedor");
    }
  };

  const filtrosAtivos =
    papeis.vendedor || papeis.supervisor || papeis.gerente || desligado !== "todos" || !!supervisorId;

  const limparFiltros = () => {
    setPapeis({ vendedor: false, supervisor: false, gerente: false });
    setDesligado("todos");
    setSupervisorId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<Vendedor>[] = [
    {
      header: "Nome",
      sortKey: "nome",
      cell: (v) => (
        <div>
          <p className="font-medium">{v.nome}</p>
          {v.nomeReduzido && <p className="text-xs text-muted-foreground">{v.nomeReduzido}</p>}
        </div>
      ),
    },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (v) => <span className="font-mono text-xs">{v.codigoErp || "—"}</span>,
    },
    {
      header: "Contato",
      cell: (v) => (
        <div className="text-xs">
          {v.telefone && <p>{v.telefone}</p>}
          {v.email && <p className="text-muted-foreground">{v.email}</p>}
          {!v.telefone && !v.email && "—"}
        </div>
      ),
    },
    {
      header: "Papéis",
      cell: (v) => (
        <div className="flex flex-wrap gap-1">
          {v.vendedor && <Badge variant="outline">Vendedor</Badge>}
          {v.supervisor && <Badge variant="outline">Supervisor</Badge>}
          {v.gerente && <Badge variant="outline">Gerente</Badge>}
        </div>
      ),
    },
    { header: "Status", sortKey: "ativo", cell: (v) => <StatusDot active={v.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (v) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(v)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(v)}>
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
        onCreate={() => router.push("/gerencial/vendedores/novo")}
        createLabel="Novo vendedor"
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
            <FieldLabel>Papel</FieldLabel>
            <div className="space-y-1.5">
              {(["vendedor", "supervisor", "gerente"] as const).map((papel) => (
                <label key={papel} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={papeis[papel]}
                    onCheckedChange={(v) => {
                      setPapeis((prev) => ({ ...prev, [papel]: v === true }));
                      setPage(1);
                    }}
                  />
                  {papel === "vendedor" ? "Vendedor" : papel === "supervisor" ? "Supervisor" : "Gerente"}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Desligado</FieldLabel>
            <Select
              value={desligado}
              onValueChange={(v) => {
                setDesligado(v as SimNaoTodos);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Supervisor</FieldLabel>
            <Select
              value={supervisorId ?? "none"}
              onValueChange={(v) => {
                setSupervisorId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Qualquer</SelectItem>
                {(supervisoresQuery.data?.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nomeReduzido || s.nome}
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
        rowKey={(v) => v.id}
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
        emptyMessage="Nenhum vendedor cadastrado."
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
