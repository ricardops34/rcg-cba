"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotaEntrada } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type NotaRow = NotaEntrada & {
  fornecedor?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
};

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Consulta read-only das notas de compra. Sem filtro de vendedor, ao contrário
// de Notas de Saída: compra não tem carteira — quem chega aqui já passou pela
// permissão da rotina.
export default function NotasEntradaPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<NotaRow>("notas-entrada", {
    search,
    page,
    pageSize,
    ...(sortBy ? { sortBy, sortOrder } : {}),
    ...(ano && /^\d{4}$/.test(ano) ? { ano: Number(ano) } : {}),
    ...(mes ? { mes: Number(mes) } : {}),
  });

  const filtrosAtivos = !!ano || !!mes;
  const limparFiltros = () => {
    setAno("");
    setMes(undefined);
    setPage(1);
  };

  const columns: ColumnDef<NotaRow>[] = [
    {
      header: "Nota",
      sortKey: "numero",
      cell: (n) => (
        <span className="font-mono font-medium">
          {n.numero}
          {n.serie && <span className="text-muted-foreground">/{n.serie}</span>}
        </span>
      ),
    },
    { header: "Emissão", sortKey: "dtEmissao", cell: (n) => dataBr(n.dtEmissao) },
    { header: "Entrada", sortKey: "dtEntrada", cell: (n) => dataBr(n.dtEntrada) },
    {
      header: "Fornecedor",
      cell: (n) => (
        <span className="text-xs">
          {n.fornecedor ? n.fornecedor.nomeFantasia || n.fornecedor.razaoSocial : "—"}
        </span>
      ),
    },
    { header: "Vlr. itens", sortKey: "vlrItens", cell: (n) => moeda(n.vlrItens) },
    { header: "Vlr. bruto", sortKey: "vlrBruto", cell: (n) => moeda(n.vlrBruto) },
    { header: "Status", sortKey: "ativo", cell: (n) => <StatusDot active={n.ativo} /> },
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel htmlFor="filtro-ano">Ano</FieldLabel>
            <Input
              id="filtro-ano"
              placeholder="Ex.: 2026"
              inputMode="numeric"
              maxLength={4}
              value={ano}
              onChange={(e) => {
                setAno(e.target.value.replace(/\D/g, ""));
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Mês</FieldLabel>
            <Select
              value={mes ?? "none"}
              onValueChange={(v) => {
                setMes(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todos</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.padStart(2, "0")}
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
        rowKey={(n) => n.id}
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
        onRowClick={(n) => router.push(`/cadastros/notas-entrada/${n.id}`)}
        emptyMessage="Nenhuma nota de entrada."
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
