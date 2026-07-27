"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { TituloReceber } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TituloRow = TituloReceber & {
  cliente?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
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
export default function TitulosReceberPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [situacao, setSituacao] = useState<"todos" | "abertos" | "baixados">("todos");

  const escopoQuery = useQuery({
    queryKey: ["escopo", "vendedores"],
    queryFn: () =>
      apiFetch<{ data: VendedorEscopo[]; restrito: boolean }>("/escopo/vendedores"),
  });
  const opcoesVendedor = escopoQuery.data?.data ?? [];
  const restrito = escopoQuery.data?.restrito ?? false;
  const mostrarFiltroVendedor = !restrito || opcoesVendedor.length > 1;

  const { data, isLoading, isFetching, refetch } = useResourceList<TituloRow>("titulos-receber", {
    search,
    page,
    pageSize,
    ...(sortBy ? { sortBy, sortOrder } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(situacao !== "todos" ? { aberto: situacao === "abertos" } : {}),
  });

  const filtrosAtivos = !!vendedorId || situacao !== "todos";
  const limparFiltros = () => {
    setVendedorId(undefined);
    setSituacao("todos");
    setPage(1);
  };

  const columns: ColumnDef<TituloRow>[] = [
    {
      header: "Título",
      sortKey: "numero",
      cell: (t) => (
        <span className="font-mono font-medium">
          {t.prefixo && <span className="text-muted-foreground">{t.prefixo}-</span>}
          {t.numero}
          {t.parcela && <span className="text-muted-foreground">/{t.parcela}</span>}
        </span>
      ),
    },
    {
      header: "Cliente",
      cell: (t) => (
        <span className="text-xs">{t.cliente ? t.cliente.nomeFantasia || t.cliente.razaoSocial : "—"}</span>
      ),
    },
    {
      header: "Vendedor",
      cell: (t) => (
        <span className="text-xs">{t.vendedor ? t.vendedor.nomeReduzido || t.vendedor.nome : "—"}</span>
      ),
    },
    { header: "Emissão", sortKey: "emissao", cell: (t) => dataBr(t.emissao) },
    { header: "Vencimento", sortKey: "vencimento", cell: (t) => dataBr(t.vencimento) },
    { header: "Valor", sortKey: "valor", cell: (t) => moeda(t.valor) },
    { header: "Saldo", sortKey: "saldo", cell: (t) => moeda(t.saldo) },
    {
      header: "Situação",
      sortKey: "dtBaixa",
      cell: (t) =>
        t.dtBaixa ? (
          <Badge variant="outline">Baixado {dataBr(t.dtBaixa)}</Badge>
        ) : (
          <Badge>Aberto</Badge>
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
            <FieldLabel>Situação</FieldLabel>
            <Select
              value={situacao}
              onValueChange={(v) => {
                setSituacao(v as "todos" | "abertos" | "baixados");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="abertos">Abertos</SelectItem>
                <SelectItem value="baixados">Baixados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FiltersPopover>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(t) => t.id}
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
        onRowClick={(t) => router.push(`/comercial/titulos-receber/${t.id}`)}
        emptyMessage="Nenhum título a receber."
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
