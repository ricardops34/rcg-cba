"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Cliente, TipoPessoa, Vendedor } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

type SimNaoTodos = "todos" | "sim" | "nao";
type TipoPessoaFiltro = "todos" | TipoPessoa;

type ClienteRow = Cliente & {
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
};

// Listagem base: os mesmos filtros de Clientes. A visualização (clique na
// linha) é a Posição de Cliente — agrupado de notas, títulos e mix.
export default function PosicaoClientePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("razaoSocial");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaFiltro>("todos");
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [carteira, setCarteira] = useState<SimNaoTodos>("todos");

  // Opções de vendedor já restritas ao escopo do usuário logado — não usa
  // /vendedores direto (aquele endpoint não tem restrição de carteira).
  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () => apiFetch<{ data: Vendedor[]; restrito: boolean }>("/clientes/vendedores-escopo"),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const restrito = vendedoresEscopoQuery.data?.restrito ?? false;
  const mostrarFiltroVendedor = !restrito || opcoesVendedor.length > 1;

  const { data, isLoading, isFetching, refetch } = useResourceList<ClienteRow>("clientes", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(tipoPessoa !== "todos" ? { tipoPessoa } : {}),
    ...(uf ? { uf } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(carteira !== "todos" ? { carteira: carteira === "sim" } : {}),
  });

  const filtrosAtivos = tipoPessoa !== "todos" || !!uf || !!vendedorId || carteira !== "todos";

  const limparFiltros = () => {
    setTipoPessoa("todos");
    setUf(undefined);
    setVendedorId(undefined);
    setCarteira("todos");
    setPage(1);
  };

  const columns: ColumnDef<ClienteRow>[] = [
    {
      header: "Razão social",
      sortKey: "razaoSocial",
      cell: (c) => (
        <div>
          <p className="font-medium">{c.razaoSocial}</p>
          {c.nomeFantasia && <p className="text-xs text-muted-foreground">{c.nomeFantasia}</p>}
        </div>
      ),
    },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp || "—"}</span>,
    },
    {
      header: "CNPJ/CPF",
      sortKey: "cnpjCpf",
      cell: (c) => <span className="font-mono text-xs">{c.cnpjCpf || "—"}</span>,
    },
    {
      header: "Município/UF",
      sortKey: "municipio",
      cell: (c) =>
        c.municipio || c.uf ? (
          <span className="text-xs">{[c.municipio, c.uf].filter(Boolean).join("/")}</span>
        ) : (
          "—"
        ),
    },
    {
      header: "Vendedor",
      cell: (c) => (
        <span className="text-xs">{c.vendedor ? c.vendedor.nomeReduzido || c.vendedor.nome : "—"}</span>
      ),
    },
    {
      header: "Contato",
      cell: (c) => (
        <div className="text-xs">
          {c.telefone && <p>{c.telefone}</p>}
          {c.email && <p className="text-muted-foreground">{c.email}</p>}
          {!c.telefone && !c.email && "—"}
        </div>
      ),
    },
    { header: "Status", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
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
            <FieldLabel>Tipo de pessoa</FieldLabel>
            <Select
              value={tipoPessoa}
              onValueChange={(v) => {
                setTipoPessoa(v as TipoPessoaFiltro);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="juridica">Jurídica</SelectItem>
                <SelectItem value="fisica">Física</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>UF</FieldLabel>
            <Select
              value={uf ?? "todas"}
              onValueChange={(v) => {
                setUf(v === "todas" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {UFS.map((sigla) => (
                  <SelectItem key={sigla} value={sigla}>
                    {sigla}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <FieldLabel>Cliente de carteira</FieldLabel>
            <Select
              value={carteira}
              onValueChange={(v) => {
                setCarteira(v as SimNaoTodos);
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
        onRowClick={(c) => router.push(`/comercial/posicao-cliente/${c.id}`)}
        emptyMessage="Nenhum cliente encontrado."
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
