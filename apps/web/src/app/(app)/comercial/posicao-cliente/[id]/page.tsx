"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoCliente } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusDot } from "@/components/crud/status-dot";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { NotaSaidaSheet } from "@/components/comercial/nota-saida-detalhe";
import { TituloReceberSheet } from "@/components/comercial/titulo-receber-detalhe";
import { ProdutoSheet } from "@/components/comercial/produto-detalhe";
import { ArrowLeft, Search } from "lucide-react";

const LIST_ROUTE = "/comercial/posicao-cliente";

type NotaStatusFiltro = "todas" | "ativas" | "inativas";
type TituloSituacaoFiltro = "todos" | "aberto" | "vencido" | "baixado";
type SortOrder = "asc" | "desc";

type NotaRow = PosicaoCliente["notas"][number];
type TituloRow = PosicaoCliente["titulos"][number];
type MixRow = PosicaoCliente["mix"][number];

// Comparador genérico pra ordenação client-side: string usa localeCompare
// pt-BR, número/booleano (já convertido em 0/1) usa subtração; null sempre
// vai pro fim, independente da direção.
function compareValores(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR");
  return (a as number) - (b as number);
}

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

function Metrica({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

// Posição de Cliente: agrupa cliente + notas de saída + títulos a receber +
// mix de produtos comprados. Cada aba tem seu próprio filtro e barra de
// rolagem; o detalhe de nota/título abre numa cortina lateral (não navega
// pra outra página), pra não perder a busca/scroll de quem está consultando.
export default function PosicaoClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [notaSearch, setNotaSearch] = useState("");
  const [notaStatus, setNotaStatus] = useState<NotaStatusFiltro>("todas");
  const [tituloSearch, setTituloSearch] = useState("");
  const [tituloSituacao, setTituloSituacao] = useState<TituloSituacaoFiltro>("todos");
  const [mixSearch, setMixSearch] = useState("");

  const [notaSelecionadaId, setNotaSelecionadaId] = useState<string | null>(null);
  const [tituloSelecionadoId, setTituloSelecionadoId] = useState<string | null>(null);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string | null>(null);

  // Ordenação padrão de cada aba replica a ordem que já vinha do back-end
  // (mais recente/maior valor primeiro) até o usuário clicar num cabeçalho.
  const [notaSortBy, setNotaSortBy] = useState("dtEmissao");
  const [notaSortOrder, setNotaSortOrder] = useState<SortOrder>("desc");
  const [tituloSortBy, setTituloSortBy] = useState("vencimento");
  const [tituloSortOrder, setTituloSortOrder] = useState<SortOrder>("desc");
  const [mixSortBy, setMixSortBy] = useState("vlrTotal");
  const [mixSortOrder, setMixSortOrder] = useState<SortOrder>("desc");

  const toggleSort = (
    key: string,
    sortBy: string,
    setSortBy: (k: string) => void,
    setSortOrder: (fn: (o: SortOrder) => SortOrder) => void,
  ) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortOrder(() => "asc");
    } else {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    }
  };

  const { data: posicao, isLoading, isError } = useQuery({
    queryKey: ["clientes", id, "posicao"],
    queryFn: () => apiFetch<PosicaoCliente>(`/clientes/${id}/posicao`),
  });

  const notas = useMemo(() => posicao?.notas ?? [], [posicao]);
  const titulos = useMemo(() => posicao?.titulos ?? [], [posicao]);
  const mix = useMemo(() => posicao?.mix ?? [], [posicao]);

  // O lint de regras do React Compiler trata Date.now() como chamada impura
  // em qualquer ponto do corpo do componente; new Date() não é sinalizado.
  const agora = new Date().getTime();

  const notasFiltradas = useMemo(() => {
    const termo = notaSearch.trim().toLowerCase();
    return notas.filter((n) => {
      if (notaStatus === "ativas" && !n.ativo) return false;
      if (notaStatus === "inativas" && n.ativo) return false;
      if (termo && !`${n.numero} ${n.serie ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [notas, notaStatus, notaSearch]);

  const titulosFiltrados = useMemo(() => {
    const termo = tituloSearch.trim().toLowerCase();
    return titulos.filter((t) => {
      if (tituloSituacao === "aberto" && t.dtBaixa) return false;
      if (tituloSituacao === "baixado" && !t.dtBaixa) return false;
      if (
        tituloSituacao === "vencido" &&
        (t.dtBaixa || !t.vencimento || new Date(t.vencimento).getTime() >= agora)
      )
        return false;
      if (
        termo &&
        !`${t.prefixo ?? ""} ${t.numero} ${t.parcela ?? ""}`.toLowerCase().includes(termo)
      )
        return false;
      return true;
    });
  }, [titulos, tituloSituacao, tituloSearch, agora]);

  const mixFiltrado = useMemo(() => {
    const termo = mixSearch.trim().toLowerCase();
    if (!termo) return mix;
    return mix.filter(
      (m) => m.codigoErp.toLowerCase().includes(termo) || m.descricao.toLowerCase().includes(termo),
    );
  }, [mix, mixSearch]);

  const notasOrdenadas = useMemo(() => {
    const valor = (n: NotaRow): string | number | null => {
      switch (notaSortBy) {
        case "numero":
          return n.numero;
        case "dtEmissao":
          return n.dtEmissao;
        case "vendedor":
          return n.vendedor ? n.vendedor.nomeReduzido || n.vendedor.nome : null;
        case "vlrBruto":
          return n.vlrBruto;
        case "ativo":
          return n.ativo ? 1 : 0;
        default:
          return null;
      }
    };
    const ordenadas = [...notasFiltradas].sort((a, b) => compareValores(valor(a), valor(b)));
    return notaSortOrder === "desc" ? ordenadas.reverse() : ordenadas;
  }, [notasFiltradas, notaSortBy, notaSortOrder]);

  const titulosOrdenados = useMemo(() => {
    const valor = (t: TituloRow): string | number | null => {
      switch (tituloSortBy) {
        case "numero":
          return t.numero;
        case "vencimento":
          return t.vencimento;
        case "valor":
          return t.valor;
        case "saldo":
          return t.saldo;
        case "situacao":
          return t.dtBaixa ? 1 : 0;
        default:
          return null;
      }
    };
    const ordenados = [...titulosFiltrados].sort((a, b) => compareValores(valor(a), valor(b)));
    return tituloSortOrder === "desc" ? ordenados.reverse() : ordenados;
  }, [titulosFiltrados, tituloSortBy, tituloSortOrder]);

  const mixOrdenado = useMemo(() => {
    const valor = (m: MixRow): string | number | null => {
      switch (mixSortBy) {
        case "codigoErp":
          return m.codigoErp;
        case "descricao":
          return m.descricao;
        case "quantidadeTotal":
          return m.quantidadeTotal;
        case "vlrTotal":
          return m.vlrTotal;
        case "qtdNotas":
          return m.qtdNotas;
        case "ultimaCompra":
          return m.ultimaCompra;
        case "precoTabela":
          return m.precoTabela;
        default:
          return null;
      }
    };
    const ordenado = [...mixFiltrado].sort((a, b) => compareValores(valor(a), valor(b)));
    return mixSortOrder === "desc" ? ordenado.reverse() : ordenado;
  }, [mixFiltrado, mixSortBy, mixSortOrder]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !posicao) {
    return <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>;
  }

  const { cliente, resumo } = posicao;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{cliente.razaoSocial}</h1>
        <StatusDot active={cliente.ativo} />
        {!cliente.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Código ERP" value={cliente.codigoErp || "—"} />
          <Info label="Nome fantasia" value={cliente.nomeFantasia || "—"} />
          <Info label="CNPJ/CPF" value={cliente.cnpjCpf || "—"} />
          <Info
            label="Vendedor"
            value={cliente.vendedor ? cliente.vendedor.nomeReduzido || cliente.vendedor.nome : "—"}
          />
          <Info label="Tabela de preço" value={cliente.tabelaPreco?.descricao || "—"} />
          <Info
            label="Município/UF"
            value={[cliente.municipio, cliente.uf].filter(Boolean).join("/") || "—"}
          />
          <Info label="Contato" value={cliente.contato || "—"} />
          <Info label="Telefone" value={cliente.telefone || "—"} />
          <Info label="E-mail" value={cliente.email || "—"} />
          <Info label="Primeira compra" value={dataBr(cliente.primeiraCompra)} />
          <Info label="Última compra" value={dataBr(cliente.ultimaCompra)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metrica label="Notas fiscais" value={resumo.totalNotas.toLocaleString("pt-BR")} />
        <Metrica label="Total comprado" value={moeda(resumo.totalComprado)} />
        <Metrica label="Títulos em aberto" value={moeda(resumo.totalTitulosAberto)} />
        <Metrica label="Títulos vencidos" value={moeda(resumo.totalTitulosVencido)} />
      </div>

      <Tabs defaultValue="notas">
        <TabsList>
          <TabsTrigger value="notas">Notas fiscais ({notas.length})</TabsTrigger>
          <TabsTrigger value="titulos">Títulos a receber ({titulos.length})</TabsTrigger>
          <TabsTrigger value="mix">Mix de produtos ({mix.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="notas">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número..."
                    className="pl-8"
                    value={notaSearch}
                    onChange={(e) => setNotaSearch(e.target.value)}
                  />
                </div>
                <Select value={notaStatus} onValueChange={(v) => setNotaStatus(v as NotaStatusFiltro)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="ativas">Ativas</SelectItem>
                    <SelectItem value="inativas">Inativas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {notasOrdenadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <SortableTableHead
                          label="Nota"
                          active={notaSortBy === "numero"}
                          order={notaSortOrder}
                          onClick={() => toggleSort("numero", notaSortBy, setNotaSortBy, setNotaSortOrder)}
                        />
                        <SortableTableHead
                          label="Emissão"
                          active={notaSortBy === "dtEmissao"}
                          order={notaSortOrder}
                          onClick={() =>
                            toggleSort("dtEmissao", notaSortBy, setNotaSortBy, setNotaSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Vendedor"
                          active={notaSortBy === "vendedor"}
                          order={notaSortOrder}
                          onClick={() =>
                            toggleSort("vendedor", notaSortBy, setNotaSortBy, setNotaSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Vlr. bruto"
                          className="text-right"
                          active={notaSortBy === "vlrBruto"}
                          order={notaSortOrder}
                          onClick={() =>
                            toggleSort("vlrBruto", notaSortBy, setNotaSortBy, setNotaSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Status"
                          active={notaSortBy === "ativo"}
                          order={notaSortOrder}
                          onClick={() => toggleSort("ativo", notaSortBy, setNotaSortBy, setNotaSortOrder)}
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notasOrdenadas.map((n) => (
                        <TableRow
                          key={n.id}
                          className="cursor-pointer"
                          onClick={() => setNotaSelecionadaId(n.id)}
                        >
                          <TableCell className="font-mono font-medium">
                            {n.numero}
                            {n.serie && <span className="text-muted-foreground">/{n.serie}</span>}
                          </TableCell>
                          <TableCell>{dataBr(n.dtEmissao)}</TableCell>
                          <TableCell className="text-xs">
                            {n.vendedor ? n.vendedor.nomeReduzido || n.vendedor.nome : "—"}
                          </TableCell>
                          <TableCell className="text-right">{moeda(n.vlrBruto)}</TableCell>
                          <TableCell>
                            <StatusDot active={n.ativo} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="titulos">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número..."
                    className="pl-8"
                    value={tituloSearch}
                    onChange={(e) => setTituloSearch(e.target.value)}
                  />
                </div>
                <Select
                  value={tituloSituacao}
                  onValueChange={(v) => setTituloSituacao(v as TituloSituacaoFiltro)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="aberto">Em aberto</SelectItem>
                    <SelectItem value="vencido">Vencidos</SelectItem>
                    <SelectItem value="baixado">Baixados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {titulosOrdenados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum título encontrado.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <SortableTableHead
                          label="Título"
                          active={tituloSortBy === "numero"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("numero", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Vencimento"
                          active={tituloSortBy === "vencimento"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("vencimento", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Valor"
                          className="text-right"
                          active={tituloSortBy === "valor"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("valor", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Saldo"
                          className="text-right"
                          active={tituloSortBy === "saldo"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("saldo", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Situação"
                          active={tituloSortBy === "situacao"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("situacao", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {titulosOrdenados.map((t) => (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer"
                          onClick={() => setTituloSelecionadoId(t.id)}
                        >
                          <TableCell className="font-mono font-medium">
                            {t.prefixo && `${t.prefixo}-`}
                            {t.numero}
                            {t.parcela && `/${t.parcela}`}
                          </TableCell>
                          <TableCell>{dataBr(t.vencimento)}</TableCell>
                          <TableCell className="text-right">{moeda(t.valor)}</TableCell>
                          <TableCell className="text-right">{moeda(t.saldo)}</TableCell>
                          <TableCell>
                            {t.dtBaixa ? (
                              <Badge variant="outline">Baixado {dataBr(t.dtBaixa)}</Badge>
                            ) : (
                              <Badge>Aberto</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mix">
          <Card>
            <CardContent className="space-y-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código ou descrição..."
                  className="pl-8"
                  value={mixSearch}
                  onChange={(e) => setMixSearch(e.target.value)}
                />
              </div>

              {mixOrdenado.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <SortableTableHead
                          label="Código"
                          active={mixSortBy === "codigoErp"}
                          order={mixSortOrder}
                          onClick={() => toggleSort("codigoErp", mixSortBy, setMixSortBy, setMixSortOrder)}
                        />
                        <SortableTableHead
                          label="Produto"
                          active={mixSortBy === "descricao"}
                          order={mixSortOrder}
                          onClick={() => toggleSort("descricao", mixSortBy, setMixSortBy, setMixSortOrder)}
                        />
                        <SortableTableHead
                          label="Qtd. total"
                          className="text-right"
                          active={mixSortBy === "quantidadeTotal"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("quantidadeTotal", mixSortBy, setMixSortBy, setMixSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Vlr. total"
                          className="text-right"
                          active={mixSortBy === "vlrTotal"}
                          order={mixSortOrder}
                          onClick={() => toggleSort("vlrTotal", mixSortBy, setMixSortBy, setMixSortOrder)}
                        />
                        <SortableTableHead
                          label="Nº notas"
                          className="text-right"
                          active={mixSortBy === "qtdNotas"}
                          order={mixSortOrder}
                          onClick={() => toggleSort("qtdNotas", mixSortBy, setMixSortBy, setMixSortOrder)}
                        />
                        <SortableTableHead
                          label="Última compra"
                          active={mixSortBy === "ultimaCompra"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("ultimaCompra", mixSortBy, setMixSortBy, setMixSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Preço de tabela"
                          className="text-right"
                          active={mixSortBy === "precoTabela"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("precoTabela", mixSortBy, setMixSortBy, setMixSortOrder)
                          }
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mixOrdenado.map((m) => (
                        <TableRow
                          key={m.produtoId}
                          className="cursor-pointer"
                          onClick={() => setProdutoSelecionadoId(m.produtoId)}
                        >
                          <TableCell className="font-mono text-xs">{m.codigoErp}</TableCell>
                          <TableCell>
                            {m.descricao}
                            {m.unidade && <span className="text-xs text-muted-foreground"> ({m.unidade})</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {m.quantidadeTotal.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">{moeda(m.vlrTotal)}</TableCell>
                          <TableCell className="text-right">{m.qtdNotas}</TableCell>
                          <TableCell>{dataBr(m.ultimaCompra)}</TableCell>
                          <TableCell className="text-right">{moeda(m.precoTabela)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NotaSaidaSheet id={notaSelecionadaId} onOpenChange={(o) => !o && setNotaSelecionadaId(null)} />
      <TituloReceberSheet
        id={tituloSelecionadoId}
        onOpenChange={(o) => !o && setTituloSelecionadoId(null)}
      />
      <ProdutoSheet
        id={produtoSelecionadoId}
        onOpenChange={(o) => !o && setProdutoSelecionadoId(null)}
      />
    </div>
  );
}
