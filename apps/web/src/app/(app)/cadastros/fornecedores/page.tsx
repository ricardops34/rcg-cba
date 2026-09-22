"use client";

import { useState } from "react";
import type { Fornecedor } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FornecedorSheet } from "@/components/compras/fornecedor-sheet";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Espelho read-only do ERP: sem "Novo" e sem ações de linha — o cadastro entra
// e sai por /integracao/fornecedores.
export default function FornecedoresPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [uf, setUf] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<Fornecedor>(
    "fornecedores",
    {
      search,
      page,
      pageSize,
      ...(sortBy ? { sortBy, sortOrder } : {}),
      ...(status ? { ativo: status } : {}),
      ...(uf.length === 2 ? { uf: uf.toUpperCase() } : {}),
    },
  );

  const filtrosAtivos = !!status || !!uf;
  const limparFiltros = () => {
    setStatus(undefined);
    setUf("");
    setPage(1);
  };

  const columns: ColumnDef<Fornecedor>[] = [
    { header: "Código", sortKey: "codigoErp", cell: (f) => <span className="font-mono text-xs">{f.codigoErp || "—"}</span> },
    {
      header: "Fornecedor",
      sortKey: "razaoSocial",
      cell: (f) => (
        <div>
          <p className="font-medium">{f.nomeFantasia || f.razaoSocial}</p>
          {f.nomeFantasia && (
            <p className="text-xs text-muted-foreground">{f.razaoSocial}</p>
          )}
        </div>
      ),
    },
    { header: "CNPJ/CPF", cell: (f) => <span className="font-mono text-xs">{f.cnpjCpf || "—"}</span> },
    { header: "Município", sortKey: "municipio", cell: (f) => <span className="text-xs">{f.municipio || "—"}</span> },
    { header: "UF", sortKey: "uf", cell: (f) => f.uf || "—" },
    { header: "Telefone", cell: (f) => <span className="text-xs">{f.telefone || f.celular || "—"}</span> },
    { header: "Status", sortKey: "ativo", cell: (f) => <StatusDot active={f.ativo} /> },
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
        actions={
          <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
            <div className="space-y-2">
              <FieldLabel>Status</FieldLabel>
              <Select
                value={status ?? "none"}
                onValueChange={(v) => {
                  setStatus(v === "none" ? undefined : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todos</SelectItem>
                  <SelectItem value="true">Ativos</SelectItem>
                  <SelectItem value="false">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="filtro-uf">UF</FieldLabel>
              <Input
                id="filtro-uf"
                placeholder="Ex.: MS"
                maxLength={2}
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase());
                  setPage(1);
                }}
              />
            </div>
          </FiltersPopover>
        }
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(f) => f.id}
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
        onRowClick={(f) => setDetalheId(f.id)}
        emptyMessage="Nenhum fornecedor."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />

      <FornecedorSheet id={detalheId} onOpenChange={(open) => !open && setDetalheId(null)} />
    </div>
  );
}
