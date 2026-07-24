"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { NotaSaidaItem } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ItemRow = NotaSaidaItem & {
  produto?: { id: string; codigoErp: string; descricao: string; unidade: string | null } | null;
  cliente?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
  notaSaida?: { id: string; numero: string; serie: string | null } | null;
};

interface VendedorEscopo {
  id: string;
  nome: string;
  nomeReduzido: string | null;
}

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Consulta read-only, com o mesmo escopo hierárquico de Clientes.
export default function ItensNotaSaidaPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState<string | undefined>(undefined);

  const escopoQuery = useQuery({
    queryKey: ["escopo", "vendedores"],
    queryFn: () =>
      apiFetch<{ data: VendedorEscopo[]; restrito: boolean }>("/escopo/vendedores"),
  });
  const opcoesVendedor = escopoQuery.data?.data ?? [];
  const restrito = escopoQuery.data?.restrito ?? false;
  const mostrarFiltroVendedor = !restrito || opcoesVendedor.length > 1;

  const { data, isLoading, isFetching, refetch } = useResourceList<ItemRow>("itens-nota-saida", {
    search,
    page,
    pageSize,
    ...(sortBy ? { sortBy, sortOrder } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(ano && /^\d{4}$/.test(ano) ? { ano: Number(ano) } : {}),
    ...(mes ? { mes: Number(mes) } : {}),
  });

  const filtrosAtivos = !!vendedorId || !!ano || !!mes;
  const limparFiltros = () => {
    setVendedorId(undefined);
    setAno("");
    setMes(undefined);
    setPage(1);
  };

  const columns: ColumnDef<ItemRow>[] = [
    {
      header: "Produto",
      cell: (it) => (
        <div>
          <p className="font-medium">{it.produto?.descricao ?? "—"}</p>
          <p className="font-mono text-xs text-muted-foreground">{it.produto?.codigoErp}</p>
        </div>
      ),
    },
    {
      header: "Nota",
      cell: (it) => (
        <span className="font-mono text-xs">
          {it.notaSaida ? `${it.notaSaida.numero}${it.notaSaida.serie ? `/${it.notaSaida.serie}` : ""}` : "—"}
        </span>
      ),
    },
    { header: "Emissão", sortKey: "dtEmissao", cell: (it) => dataBr(it.dtEmissao) },
    {
      header: "Cliente",
      cell: (it) => (
        <span className="text-xs">
          {it.cliente ? it.cliente.nomeFantasia || it.cliente.razaoSocial : "—"}
        </span>
      ),
    },
    {
      header: "Vendedor",
      cell: (it) => (
        <span className="text-xs">{it.vendedor ? it.vendedor.nomeReduzido || it.vendedor.nome : "—"}</span>
      ),
    },
    {
      header: "Qtd",
      sortKey: "quantidade",
      cell: (it) => it.quantidade.toLocaleString("pt-BR"),
    },
    { header: "Vlr. unit.", sortKey: "vlrUnitario", cell: (it) => moeda(it.vlrUnitario) },
    { header: "Total", sortKey: "vlrTotal", cell: (it) => moeda(it.vlrTotal) },
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
          {mostrarFiltroVendedor && (
            <div className="space-y-2">
              <FieldLabel>Vendedor</FieldLabel>
              <Select
                value={vendedorId ?? "none"}
                onValueChange={(v) => {
                  setVendedorId(v === "none" ? undefined : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer</SelectItem>
                  {opcoesVendedor.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nomeReduzido || v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <FieldLabel htmlFor="filtro-ano">Ano</FieldLabel>
            <Input
              id="filtro-ano"
              placeholder="Ex.: 2025"
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
        rowKey={(it) => it.id}
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
        onRowClick={(it) => it.notaSaidaId && router.push(`/comercial/notas-saida/${it.notaSaidaId}`)}
        emptyMessage="Nenhum item de nota."
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
