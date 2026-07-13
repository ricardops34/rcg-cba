"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Files,
  Package,
  Receipt,
  TrendingUp,
  UserSearch,
  Wallet,
  X,
} from "lucide-react";
import type { PosicaoCliente } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ClienteSearchRow {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  codigoErp: string | null;
  municipio: string | null;
  uf: string | null;
}

interface NotaRow {
  id: string;
  numero: string;
  serie: string | null;
  dtEmissao: string;
  vlrItens: number;
  comodato: boolean;
  colaborador: { nomeReduzido: string | null; usuario: { nome: string } } | null;
}

interface TituloRow {
  id: string;
  numero: string;
  parcela: string | null;
  emissao: string;
  vencimento: string;
  valor: number;
  saldo: number;
  dtBaixa: string | null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (v: string | Date) => new Date(v).toLocaleDateString("pt-BR");

function NotasTab({ clienteId, comodato, emptyMessage }: { clienteId: string; comodato: boolean; emptyMessage: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["notas-saida", "posicao", clienteId, comodato, page, pageSize],
    queryFn: () =>
      apiFetch<Paginated<NotaRow>>("/notas-saida", {
        query: { clienteId, comodato, page, pageSize },
      }),
  });

  const columns: ColumnDef<NotaRow>[] = [
    {
      header: "Nota",
      cell: (n) => (
        <span className="font-mono text-xs">
          {n.numero}
          {n.serie ? `/${n.serie}` : ""}
        </span>
      ),
    },
    { header: "Emissão", cell: (n) => fmtDate(n.dtEmissao) },
    {
      header: "Vendedor",
      cell: (n) =>
        n.colaborador ? (
          n.colaborador.nomeReduzido || n.colaborador.usuario.nome
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Valor",
      cell: (n) => <span className="font-medium">{brl(n.vlrItens)}</span>,
    },
  ];

  return (
    <EntityTable
      columns={columns}
      rows={data?.data ?? []}
      rowKey={(n) => n.id}
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
      emptyMessage={emptyMessage}
    />
  );
}

function TitulosTab({ clienteId }: { clienteId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["titulos-receber", "posicao", clienteId, page, pageSize],
    queryFn: () =>
      apiFetch<Paginated<TituloRow>>("/titulos-receber", {
        query: { clienteId, page, pageSize },
      }),
  });

  const columns: ColumnDef<TituloRow>[] = [
    {
      header: "Título",
      cell: (t) => (
        <span className="font-mono text-xs">
          {t.numero}
          {t.parcela ? `/${t.parcela}` : ""}
        </span>
      ),
    },
    { header: "Emissão", cell: (t) => fmtDate(t.emissao) },
    { header: "Vencimento", cell: (t) => fmtDate(t.vencimento) },
    { header: "Valor", cell: (t) => brl(t.valor) },
    {
      header: "Saldo",
      cell: (t) => <span className="font-medium">{brl(t.saldo)}</span>,
    },
    {
      header: "Situação",
      cell: (t) => {
        const pago = t.saldo <= 0 || !!t.dtBaixa;
        if (pago) return <Badge variant="success">Pago</Badge>;
        if (new Date(t.vencimento).getTime() < Date.now())
          return <Badge variant="destructive">Vencido</Badge>;
        return <Badge variant="secondary">Aberto</Badge>;
      },
    },
  ];

  return (
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
      emptyMessage="Nenhum título."
    />
  );
}

export default function PosicaoClientesPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: resultados, isFetching: buscando } = useQuery({
    queryKey: ["clientes", "posicao-search", q],
    queryFn: () =>
      apiFetch<{ data: ClienteSearchRow[] }>("/clientes", {
        query: { search: q, pageSize: 20 },
      }),
    enabled: !selectedClienteId && q.length > 0,
  });

  const { data: posicao, isLoading: posicaoLoading } = useQuery({
    queryKey: ["clientes", "posicao", selectedClienteId],
    queryFn: () =>
      apiFetch<PosicaoCliente>(`/clientes/${selectedClienteId}/posicao`),
    enabled: !!selectedClienteId,
  });

  const selecionar = (c: ClienteSearchRow) => {
    setSelectedClienteId(c.id);
    setSearch("");
    setQ("");
  };

  const cliente = posicao?.cliente;
  const ind = posicao?.indicadores;

  const kpis = [
    {
      label: "Faturamento 12m",
      value: brl(ind?.faturamento12m ?? 0),
      sub: null as string | null,
      icon: TrendingUp,
      tone: "from-emerald-500 to-emerald-600",
    },
    {
      label: "Ticket médio",
      value: brl(ind?.ticketMedio ?? 0),
      sub: null,
      icon: Receipt,
      tone: "from-blue-600 to-blue-700",
    },
    {
      label: "Última compra",
      value: ind?.ultimaCompra ? fmtDate(ind.ultimaCompra) : "—",
      sub: ind?.diasSemCompra != null ? `há ${ind.diasSemCompra} dias` : null,
      icon: CalendarClock,
      tone: "from-cyan-500 to-cyan-700",
    },
    {
      label: "Notas emitidas",
      value: String(ind?.qtdNotas ?? 0),
      sub: null,
      icon: FileText,
      tone: "from-violet-500 to-violet-700",
    },
    {
      label: "Saldo em aberto",
      value: brl(ind?.saldoAberto ?? 0),
      sub: null,
      icon: Wallet,
      tone: "from-amber-500 to-orange-600",
    },
    {
      label: "Vencido",
      value: brl(ind?.valorVencido ?? 0),
      sub: ind && ind.maiorAtraso > 0 ? `maior atraso: ${ind.maiorAtraso} dias` : null,
      icon: AlertTriangle,
      tone: "from-red-500 to-red-700",
    },
    {
      label: "Títulos abertos",
      value: String(ind?.titulosAbertos ?? 0),
      sub: null,
      icon: Files,
      tone: "from-slate-500 to-slate-700",
    },
    {
      label: "Comodato ativo",
      value: brl(ind?.comodatoAtivo ?? 0),
      sub: ind ? `${ind.qtdComodatos} notas` : null,
      icon: Package,
      tone: "from-teal-500 to-teal-700",
    },
  ];

  return (
    <div className="space-y-6">
      {!selectedClienteId ? (
        <div className="max-w-xl space-y-2">
          <Input
            placeholder="Buscar cliente por nome, fantasia ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {q.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
              {buscando && (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              )}
              {!buscando && (resultados?.data.length ?? 0) === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado.
                </p>
              )}
              {!buscando &&
                resultados?.data.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selecionar(c)}
                    className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60"
                  >
                    <span>
                      <span className="font-medium">{c.nomeFantasia || c.razaoSocial}</span>
                      {c.municipio && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.municipio}
                          {c.uf ? `/${c.uf}` : ""}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.codigoErp ?? "—"}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Cliente selecionado:{" "}
            <span className="font-medium text-foreground">
              {cliente ? cliente.nomeFantasia || cliente.razaoSocial : "..."}
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedClienteId(null)}
          >
            <X className="size-4" /> Trocar cliente
          </Button>
        </div>
      )}

      {!selectedClienteId && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 text-muted-foreground">
          <UserSearch className="size-8" />
          <p className="text-sm">
            Busque e selecione um cliente para ver a posição consolidada.
          </p>
        </div>
      )}

      {selectedClienteId && (
        <>
          <div className="rounded-xl border border-border/70 bg-card p-4">
            {posicaoLoading || !cliente ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-96" />
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {cliente.nomeFantasia || cliente.razaoSocial}
                  </h2>
                  {cliente.nomeFantasia && (
                    <p className="text-sm text-muted-foreground">{cliente.razaoSocial}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {cliente.cnpjCpf && <span>CNPJ/CPF: {cliente.cnpjCpf}</span>}
                    {cliente.municipio && (
                      <span>
                        {cliente.municipio}
                        {cliente.uf ? `/${cliente.uf}` : ""}
                      </span>
                    )}
                    {cliente.vendedorNome && <span>Vendedor: {cliente.vendedorNome}</span>}
                    {cliente.telefone && <span>{cliente.telefone}</span>}
                    {cliente.email && <span>{cliente.email}</span>}
                  </div>
                </div>
                <StatusDot active={cliente.ativo} />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.label}
                className={`relative overflow-hidden rounded-xl bg-linear-to-br p-4 text-white shadow-md ${k.tone}`}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-white/10 blur-xl"
                />
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold tracking-wider uppercase opacity-90">
                    {k.label}
                  </p>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white/20">
                    <k.icon className="size-4.5" />
                  </span>
                </div>
                {posicaoLoading ? (
                  <Skeleton className="mt-2 h-8 w-24 bg-white/25" />
                ) : (
                  <>
                    <p className="mt-1 text-2xl font-bold tracking-tight">{k.value}</p>
                    {k.sub && <p className="text-xs opacity-90">{k.sub}</p>}
                  </>
                )}
              </div>
            ))}
          </div>

          <Tabs defaultValue="vendas">
            <TabsList>
              <TabsTrigger value="vendas">Notas de venda</TabsTrigger>
              <TabsTrigger value="titulos">Títulos a receber</TabsTrigger>
              <TabsTrigger value="comodato">Comodato</TabsTrigger>
            </TabsList>
            <TabsContent value="vendas">
              <NotasTab
                clienteId={selectedClienteId}
                comodato={false}
                emptyMessage="Nenhuma nota de venda."
              />
            </TabsContent>
            <TabsContent value="titulos">
              <TitulosTab clienteId={selectedClienteId} />
            </TabsContent>
            <TabsContent value="comodato">
              <NotasTab
                clienteId={selectedClienteId}
                comodato={true}
                emptyMessage="Nenhuma nota de comodato."
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
