"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoCliente, SugestaoCompraCalculada } from "@plataforma/contracts";
import { apiFetch, assetUrl } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { SugestaoCompraCalculadaTabela } from "@/components/crud/sugestao-compra-calculada";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusDot } from "@/components/crud/status-dot";
import { TituloStatusBadge } from "@/components/comercial/titulo-status-badge";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotaSaidaSheet } from "@/components/comercial/nota-saida-detalhe";
import { NotaEntradaSheet } from "@/components/compras/nota-entrada-detalhe";
import { TituloReceberSheet } from "@/components/comercial/titulo-receber-detalhe";
import { ProdutoSheet } from "@/components/comercial/produto-detalhe";
import {
  SegundaViaNota,
  SegundaViaTitulo,
  useEnvioPorEmail,
  useEnvioPorSms,
  useEmailDisponivel,
  useSmsDisponivel,
} from "@/components/comercial/segunda-via";
import { HistoricoAtendimento } from "@/components/comercial/historico-atendimento";
import { ArrowLeft, Loader2, Mail, MessageCircle, MessageSquareText, Search } from "lucide-react";

const LIST_ROUTE = "/comercial/posicao-cliente";

type TituloSituacaoFiltro = "todos" | "aberto" | "vencido" | "baixado";
type NotaTipoFiltro = "todas" | "vendas" | "comodato";
type SortOrder = "asc" | "desc";

type NotaRow = PosicaoCliente["notas"][number];
type TituloRow = PosicaoCliente["titulos"][number];
type MixRow = PosicaoCliente["mix"][number];
type DevolucaoRow = PosicaoCliente["devolucoes"][number];

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

const STATUS_ORDEM: Record<TituloRow["status"], number> = { aberto: 0, vencido: 1, baixado: 2 };

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
const dataBr = dataCivilBr;

const telefoneBr = (v: string | null | undefined) => {
  if (!v) return "Número não informado";
  const digits = v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return v;
};

const TIPO_CONTATO_LABEL = {
  geral: "Geral",
  financeiro: "Financeiro",
  compras: "Compras",
  contabilidade_fiscal: "Contabilidade/Fiscal",
  outros: "Outros",
} as const;

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value ?? "—"}</p>
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

/**
 * Número da nota com cara de link. A linha inteira já abre o detalhe, mas só
 * o cursor dizia isso — o sistema anterior mostrava o número em azul, e é
 * nele que o usuário procura onde clicar.
 */
function LinkNota({
  numero,
  serie,
  onAbrir,
}: {
  numero: string;
  serie: string | null;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      className="font-mono font-medium text-primary underline-offset-2 hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onAbrir();
      }}
    >
      {numero}
      {serie && <span className="text-muted-foreground">/{serie}</span>}
    </button>
  );
}

/**
 * Busca por número/série e o recorte venda × comodato. Quem entra em cada
 * lado é decidido no back-end (venda efetiva; remessa de comodato).
 */
function filtrarNotas(lista: NotaRow[], busca: string, tipo: NotaTipoFiltro): NotaRow[] {
  const termo = busca.trim().toLowerCase();
  return lista.filter((n) => {
    if (tipo === "vendas" && n.comodato) return false;
    if (tipo === "comodato" && !n.comodato) return false;
    return !termo || `${n.numero} ${n.serie ?? ""}`.toLowerCase().includes(termo);
  });
}

function ordenarNotas(lista: NotaRow[], sortBy: string, sortOrder: SortOrder): NotaRow[] {
  const valor = (n: NotaRow): string | number | null => {
    switch (sortBy) {
      case "numero":
        // Pelo valor, não pelo texto: a nota antiga tem 6 dígitos ("068704")
        // e a nova 9 ("000112832"), e como texto a antiga vinha depois.
        return /^\d+$/.test(n.numero) ? n.numero.padStart(15, "0") : n.numero;
      case "comodato":
        return n.comodato ? 1 : 0;
      case "dtEmissao":
        return n.dtEmissao;
      case "vendedor":
        return n.vendedor ? n.vendedor.nomeReduzido || n.vendedor.nome : null;
      case "vlrBruto":
        return n.vlrBruto;
      default:
        return null;
    }
  };
  const ordenadas = [...lista].sort((a, b) => compareValores(valor(a), valor(b)));
  return sortOrder === "desc" ? ordenadas.reverse() : ordenadas;
}

/**
 * Aba "Notas fiscais": a venda e a remessa de comodato numa lista só, com a
 * coluna Comodato e o filtro para separar. Até 2026-10-07 eram duas abas com
 * as mesmas colunas.
 */
function TabelaNotas({
  notas,
  busca,
  onBuscaChange,
  tipo,
  onTipoChange,
  sortBy,
  sortOrder,
  onToggleSort,
  onSelecionar,
  mensagemVazio,
}: {
  notas: NotaRow[];
  busca: string;
  onBuscaChange: (v: string) => void;
  tipo: NotaTipoFiltro;
  onTipoChange: (v: NotaTipoFiltro) => void;
  sortBy: string;
  sortOrder: SortOrder;
  onToggleSort: (key: string) => void;
  onSelecionar: (id: string) => void;
  mensagemVazio: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número..."
              className="pl-8"
              value={busca}
              onChange={(e) => onBuscaChange(e.target.value)}
            />
          </div>
          <Select value={tipo} onValueChange={(v) => onTipoChange(v as NotaTipoFiltro)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="comodato">Comodato</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{mensagemVazio}</p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortableTableHead
                    label="Nota"
                    active={sortBy === "numero"}
                    order={sortOrder}
                    onClick={() => onToggleSort("numero")}
                  />
                  <SortableTableHead
                    label="Emissão"
                    active={sortBy === "dtEmissao"}
                    order={sortOrder}
                    onClick={() => onToggleSort("dtEmissao")}
                  />
                  <SortableTableHead
                    label="Vendedor"
                    active={sortBy === "vendedor"}
                    order={sortOrder}
                    onClick={() => onToggleSort("vendedor")}
                  />
                  <SortableTableHead
                    label="Vlr. bruto"
                    className="text-right"
                    active={sortBy === "vlrBruto"}
                    order={sortOrder}
                    onClick={() => onToggleSort("vlrBruto")}
                  />
                  <SortableTableHead
                    label="Comodato"
                    active={sortBy === "comodato"}
                    order={sortOrder}
                    onClick={() => onToggleSort("comodato")}
                  />
                  <TableHead className="w-20 text-right">2ª via</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notas.map((n) => (
                  <TableRow
                    key={n.id}
                    className="cursor-pointer"
                    onClick={() => onSelecionar(n.id)}
                  >
                    <TableCell>
                      <LinkNota
                        numero={n.numero}
                        serie={n.serie}
                        onAbrir={() => onSelecionar(n.id)}
                      />
                    </TableCell>
                    <TableCell>{dataBr(n.dtEmissao)}</TableCell>
                    <TableCell className="text-xs">
                      {n.vendedor ? n.vendedor.nomeReduzido || n.vendedor.nome : "—"}
                    </TableCell>
                    <TableCell className="text-right">{moeda(n.vlrBruto)}</TableCell>
                    <TableCell>{n.comodato ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-right">
                      <SegundaViaNota notaId={n.id} numero={n.numero} temXml={n.temXml} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Aba "Devoluções": as notas que voltaram do cliente (SF1 com `tipo = 'D'`).
 *
 * Tabela própria, e não a `TabelaNotas`: não tem vendedor nem 2ª via — o
 * documento foi emitido pelo cliente, e a plataforma não o reimprime. Em
 * compensação mostra o que voltou, que é a pergunta seguinte a "devolveu".
 */
function TabelaDevolucoes({
  devolucoes,
  busca,
  onBuscaChange,
  sortBy,
  sortOrder,
  onToggleSort,
  onSelecionar,
}: {
  devolucoes: DevolucaoRow[];
  busca: string;
  onBuscaChange: (v: string) => void;
  sortBy: string;
  sortOrder: SortOrder;
  onToggleSort: (key: string) => void;
  onSelecionar: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número..."
            className="pl-8"
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
          />
        </div>

        {devolucoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma devolução deste cliente.
          </p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortableTableHead
                    label="Nota"
                    active={sortBy === "numero"}
                    order={sortOrder}
                    onClick={() => onToggleSort("numero")}
                  />
                  <SortableTableHead
                    label="Emissão"
                    active={sortBy === "dtEmissao"}
                    order={sortOrder}
                    onClick={() => onToggleSort("dtEmissao")}
                  />
                  <TableHead>Itens devolvidos</TableHead>
                  <SortableTableHead
                    label="Vlr. bruto"
                    className="text-right"
                    active={sortBy === "vlrBruto"}
                    order={sortOrder}
                    onClick={() => onToggleSort("vlrBruto")}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devolucoes.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => onSelecionar(d.id)}
                  >
                    <TableCell className="align-top">
                      <LinkNota
                        numero={d.numero}
                        serie={d.serie}
                        onAbrir={() => onSelecionar(d.id)}
                      />
                    </TableCell>
                    <TableCell className="align-top">{dataBr(d.dtEmissao)}</TableCell>
                    <TableCell className="text-xs">
                      {d.itens.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {d.itens.map((it) => (
                            <li key={it.id}>
                              {it.quantidade.toLocaleString("pt-BR")}
                              {it.produto?.unidade ? ` ${it.produto.unidade}` : ""}
                              {" · "}
                              {it.produto?.descricao ?? "Produto não identificado"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right">{moeda(d.vlrBruto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Posição de Cliente: agrupa cliente + notas de saída + remessas de comodato
// + devoluções + títulos a receber + mix de produtos comprados. Cada aba tem seu próprio
// filtro e barra de rolagem; o detalhe de nota/título abre numa cortina
// lateral (não navega pra outra página), pra não perder a busca/scroll de
// quem está consultando.
export function PosicaoClienteConteudo({
  clienteId,
  mostrarVoltar = true,
  compacto = false,
}: {
  clienteId: string;
  /** No painel do atendimento não há para onde voltar — a lista fica ao lado. */
  mostrarVoltar?: boolean;
  /** Usa duas colunas nos blocos que ficam encaixados na lateral da conversa. */
  compacto?: boolean;
}) {
  const id = clienteId;
  const router = useRouter();

  const [notaSearch, setNotaSearch] = useState("");
  const [notaTipo, setNotaTipo] = useState<NotaTipoFiltro>("todas");
  const [devolucaoSearch, setDevolucaoSearch] = useState("");
  const [tituloSearch, setTituloSearch] = useState("");
  const [tituloSituacao, setTituloSituacao] = useState<TituloSituacaoFiltro>("todos");
  const [mixSearch, setMixSearch] = useState("");

  const [notaSelecionadaId, setNotaSelecionadaId] = useState<string | null>(null);
  const [devolucaoSelecionadaId, setDevolucaoSelecionadaId] = useState<string | null>(null);
  const [tituloSelecionadoId, setTituloSelecionadoId] = useState<string | null>(null);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string | null>(null);

  // Ordenação padrão de cada aba replica a ordem que já vinha do back-end
  // (mais recente/maior valor primeiro) até o usuário clicar num cabeçalho.
  // Notas: pela nota, mais recente primeiro — o pedido do usuário ao juntar
  // venda e comodato na mesma aba.
  const [notaSortBy, setNotaSortBy] = useState("numero");
  const [notaSortOrder, setNotaSortOrder] = useState<SortOrder>("desc");
  const [devolucaoSortBy, setDevolucaoSortBy] = useState("dtEmissao");
  const [devolucaoSortOrder, setDevolucaoSortOrder] = useState<SortOrder>("desc");
  const [tituloSortBy, setTituloSortBy] = useState("vencimento");
  const [tituloSortOrder, setTituloSortOrder] = useState<SortOrder>("desc");
  const [mixSortBy, setMixSortBy] = useState("ultimaCompra");
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

  // Aba de Sugestão: mesma leitura que a listagem de Sugestão de Compra usa
  // na ação "Visualizar" — o que já está gravado, sem recalcular nada aqui.
  const {
    data: sugestaoCalculada,
    isLoading: sugestaoLoading,
    isError: sugestaoError,
  } = useQuery({
    queryKey: ["sugestao-compra", "calculada", id],
    queryFn: () => apiFetch<SugestaoCompraCalculada>(`/sugestao-compra/cliente/${id}/calculada`),
  });

  // Cobrança por e-mail: os vencidos do cliente, com boletos e DANFEs, para o
  // e-mail do cadastro. Entra no histórico de atendimento.
  const { enviar: enviarEmail, enviando: enviandoCobranca } = useEnvioPorEmail();
  const { enviar: enviarSms, enviando: enviandoCobrancaSms } = useEnvioPorSms();
  const smsCobranca = useSmsDisponivel()?.cobranca ?? false;
  const emailCobranca = useEmailDisponivel()?.cobranca ?? false;

  const notas = useMemo(() => posicao?.notas ?? [], [posicao]);
  const comodatos = useMemo(() => posicao?.comodatos ?? [], [posicao]);
  const titulos = useMemo(() => posicao?.titulos ?? [], [posicao]);
  const mix = useMemo(() => posicao?.mix ?? [], [posicao]);
  const devolucoes = useMemo(() => posicao?.devolucoes ?? [], [posicao]);

  const titulosFiltrados = useMemo(() => {
    const termo = tituloSearch.trim().toLowerCase();
    return titulos.filter((t) => {
      if (tituloSituacao !== "todos" && t.status !== tituloSituacao) return false;
      if (
        termo &&
        !`${t.prefixo ?? ""} ${t.numero} ${t.parcela ?? ""}`.toLowerCase().includes(termo)
      )
        return false;
      return true;
    });
  }, [titulos, tituloSituacao, tituloSearch]);

  const mixFiltrado = useMemo(() => {
    const termo = mixSearch.trim().toLowerCase();
    if (!termo) return mix;
    return mix.filter(
      (m) => m.codigoErp.toLowerCase().includes(termo) || m.descricao.toLowerCase().includes(termo),
    );
  }, [mix, mixSearch]);

  // O back-end manda venda e remessa separadas (o resumo de compra é só da
  // venda); a aba as junta. Os dois conjuntos são disjuntos pelo `comodato`,
  // mas o Map garante que uma nota nunca apareça duas vezes.
  const notasEComodatos = useMemo(
    () => [...new Map([...notas, ...comodatos].map((n) => [n.id, n])).values()],
    [notas, comodatos],
  );

  const notasOrdenadas = useMemo(
    () =>
      ordenarNotas(
        filtrarNotas(notasEComodatos, notaSearch, notaTipo),
        notaSortBy,
        notaSortOrder,
      ),
    [notasEComodatos, notaSearch, notaTipo, notaSortBy, notaSortOrder],
  );

  const devolucoesOrdenadas = useMemo(() => {
    const termo = devolucaoSearch.trim().toLowerCase();
    const filtradas = termo
      ? devolucoes.filter((d) =>
          `${d.numero} ${d.serie ?? ""}`.toLowerCase().includes(termo),
        )
      : devolucoes;
    const valor = (d: DevolucaoRow): string | number | null => {
      switch (devolucaoSortBy) {
        case "numero":
          return d.numero;
        case "dtEmissao":
          return d.dtEmissao;
        case "vlrBruto":
          return d.vlrBruto;
        default:
          return null;
      }
    };
    const ordenadas = [...filtradas].sort((a, b) =>
      compareValores(valor(a), valor(b)),
    );
    return devolucaoSortOrder === "desc" ? ordenadas.reverse() : ordenadas;
  }, [devolucoes, devolucaoSearch, devolucaoSortBy, devolucaoSortOrder]);

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
        case "status":
          return STATUS_ORDEM[t.status];
        case "dtBaixa":
          return t.dtBaixa;
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
        case "ultimoPrecoUnitario":
          return m.ultimoPrecoUnitario;
        case "ultimoDesconto":
          return m.ultimoDesconto;
        case "precoTabela":
          return m.precoTabela;
        case "ultimaCompra":
          return m.ultimaCompra;
        case "ativo":
          return m.ativo ? 1 : 0;
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
      <div
        className="flex min-w-0 items-center gap-3"
        data-tour="posicao-cliente-detalhe-cabecalho"
      >
        {mostrarVoltar ? (
          <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
          {cliente.razaoSocial}
        </h1>
        <StatusDot active={cliente.ativo} />
        {!cliente.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>

      <Card data-tour="posicao-cliente-detalhe-cadastro">
        <CardContent
          className={`grid grid-cols-2 gap-4 ${compacto ? "" : "sm:grid-cols-4"}`}
        >
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
          <div className={compacto ? "col-span-2" : "col-span-2 sm:col-span-4"}>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Contatos
            </p>
            <div className="overflow-hidden rounded-lg border">
              <div className="hidden grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Nome</span>
                <span>Tipo</span>
                <span>Número</span>
                <span>E-mail</span>
                <span className="sr-only">Ação</span>
              </div>
              {posicao.whatsapp.length > 0 ? (
                posicao.whatsapp.map((contato) => (
                  <div
                    key={contato.conversaId}
                    className="grid gap-1 border-t px-3 py-2 first:border-t-0 md:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] md:items-center md:gap-3"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {contato.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(contato.fotoUrl) ?? undefined}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : null}
                      {contato.nome || "—"}
                    </span>
                    <Badge variant="secondary" className="w-fit">
                      {TIPO_CONTATO_LABEL[contato.tipo]}
                    </Badge>
                    <span className="text-sm">{telefoneBr(contato.telefone)}</span>
                    <span className="break-all text-sm text-muted-foreground">
                      {contato.email || "—"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit gap-1.5"
                      onClick={() =>
                        router.push(`/comercial/atendimento?conversa=${contato.conversaId}`)
                      }
                    >
                      <MessageCircle className="size-4" />
                      Abrir
                    </Button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Nenhum WhatsApp vinculado.
                </p>
              )}
            </div>
            {(cliente.contato || cliente.telefone || cliente.email) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Cadastro legado: {[cliente.contato, cliente.telefone, cliente.email]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <Info label="Primeira compra" value={dataBr(cliente.primeiraCompra)} />
          <Info label="Última compra" value={dataBr(cliente.ultimaCompra)} />
        </CardContent>
      </Card>

      <div
        className={`grid grid-cols-2 gap-4 ${compacto ? "" : "lg:grid-cols-4"}`}
        data-tour="posicao-cliente-detalhe-resumo"
      >
        <Metrica label="Notas fiscais" value={resumo.totalNotas.toLocaleString("pt-BR")} />
        <Metrica label="Total comprado" value={moeda(resumo.totalComprado)} />
        <Metrica label="Títulos em aberto" value={moeda(resumo.totalTitulosAberto)} />
        <Metrica label="Títulos vencidos" value={moeda(resumo.totalTitulosVencido)} />
        {/* Só aparece quando há devolução: um "R$ 0,00" fixo ocuparia uma
            célula da grade em todo cliente para dizer que nada aconteceu. */}
        {resumo.totalDevolucoes > 0 && (
          <Metrica label="Total devolvido" value={moeda(resumo.totalDevolvido)} />
        )}
      </div>

      <Tabs defaultValue="notas" data-tour="posicao-cliente-detalhe-conteudo">
        <div
          className="-mx-1 overflow-x-auto px-1 pb-1"
          data-tour="posicao-cliente-detalhe-abas"
        >
          <TabsList>
            <TabsTrigger value="notas">Notas fiscais ({notasEComodatos.length})</TabsTrigger>
            <TabsTrigger value="devolucoes">Devoluções ({devolucoes.length})</TabsTrigger>
            <TabsTrigger value="titulos">Títulos a receber ({titulos.length})</TabsTrigger>
            <TabsTrigger value="mix">Mix de produtos ({mix.length})</TabsTrigger>
            <TabsTrigger value="sugestao">Sugestão ({sugestaoCalculada?.itens.length ?? 0})</TabsTrigger>
            <TabsTrigger value="historico">Histórico de atendimento</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="notas">
          <TabelaNotas
            notas={notasOrdenadas}
            busca={notaSearch}
            onBuscaChange={setNotaSearch}
            tipo={notaTipo}
            onTipoChange={setNotaTipo}
            sortBy={notaSortBy}
            sortOrder={notaSortOrder}
            onToggleSort={(k) => toggleSort(k, notaSortBy, setNotaSortBy, setNotaSortOrder)}
            onSelecionar={setNotaSelecionadaId}
            mensagemVazio="Nenhuma nota encontrada."
          />
        </TabsContent>

        <TabsContent value="devolucoes">
          <TabelaDevolucoes
            devolucoes={devolucoesOrdenadas}
            busca={devolucaoSearch}
            onBuscaChange={setDevolucaoSearch}
            sortBy={devolucaoSortBy}
            sortOrder={devolucaoSortOrder}
            onToggleSort={(k) =>
              toggleSort(k, devolucaoSortBy, setDevolucaoSortBy, setDevolucaoSortOrder)
            }
            onSelecionar={setDevolucaoSelecionadaId}
          />
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
                {emailCobranca && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={enviandoCobranca || !titulos.some((t) => t.status === "vencido")}
                  title={
                    titulos.some((t) => t.status === "vencido")
                      ? "Envia os títulos vencidos, com boletos atualizados e DANFEs, para o e-mail do cadastro do cliente"
                      : "Este cliente não tem títulos vencidos"
                  }
                  onClick={() =>
                    void enviarEmail(
                      `/documentos-email/cobranca/${id}`,
                      undefined,
                      `Enviar a cobrança dos ${titulos.filter((t) => t.status === "vencido").length} título(s) vencido(s), com boletos atualizados e DANFEs, por e-mail?`,
                    )
                  }
                >
                  {enviandoCobranca ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Enviar cobrança por e-mail
                </Button>
                )}
                {smsCobranca && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={enviandoCobrancaSms || !titulos.some((t) => t.status === "vencido")}
                  title="Envia a quantidade e o total dos títulos vencidos para o celular do cadastro do cliente"
                  onClick={() =>
                    void enviarSms(
                      `/sms/cobranca/${id}`,
                      undefined,
                      `Enviar por SMS a cobrança dos ${titulos.filter((t) => t.status === "vencido").length} título(s) vencido(s)?`,
                    )
                  }
                >
                  {enviandoCobrancaSms ? <Loader2 className="size-4 animate-spin" /> : <MessageSquareText className="size-4" />}
                  Cobrança por SMS
                </Button>
                )}
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
                          label="Status"
                          active={tituloSortBy === "status"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("status", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Data de baixa"
                          active={tituloSortBy === "dtBaixa"}
                          order={tituloSortOrder}
                          onClick={() =>
                            toggleSort("dtBaixa", tituloSortBy, setTituloSortBy, setTituloSortOrder)
                          }
                        />
                        <TableHead className="w-16 text-right">Boleto</TableHead>
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
                          <TableCell>{dataBr(t.vencimento)}{t.vencimentoEfetivo && t.vencimentoEfetivo !== t.vencimento && <p className="text-xs text-muted-foreground">Dia útil: {dataBr(t.vencimentoEfetivo)}</p>}</TableCell>
                          <TableCell className="text-right">{moeda(t.valor)}</TableCell>
                          <TableCell className="text-right">{moeda(t.saldo)}</TableCell>
                          <TableCell>
                            <TituloStatusBadge status={t.status} />
                          </TableCell>
                          <TableCell>{dataBr(t.dtBaixa)}</TableCell>
                          <TableCell className="text-right">
                            <SegundaViaTitulo
                              tituloId={t.id}
                              numero={t.numero}
                              temBoleto={t.temBoleto}
                              status={t.status}
                            />
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

        <TabsContent value="historico">
          <HistoricoAtendimento clienteId={id} />
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
                          label="Últ. preço unit."
                          className="text-right"
                          active={mixSortBy === "ultimoPrecoUnitario"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("ultimoPrecoUnitario", mixSortBy, setMixSortBy, setMixSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Últ. desconto"
                          className="text-right"
                          active={mixSortBy === "ultimoDesconto"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("ultimoDesconto", mixSortBy, setMixSortBy, setMixSortOrder)
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
                        <SortableTableHead
                          label="Última compra"
                          active={mixSortBy === "ultimaCompra"}
                          order={mixSortOrder}
                          onClick={() =>
                            toggleSort("ultimaCompra", mixSortBy, setMixSortBy, setMixSortOrder)
                          }
                        />
                        <SortableTableHead
                          label="Situação"
                          active={mixSortBy === "ativo"}
                          order={mixSortOrder}
                          onClick={() => toggleSort("ativo", mixSortBy, setMixSortBy, setMixSortOrder)}
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
                          <TableCell className="text-right">{moeda(m.ultimoPrecoUnitario)}</TableCell>
                          <TableCell className="text-right">{percentual(m.ultimoDesconto)}</TableCell>
                          <TableCell className="text-right">{moeda(m.precoTabela)}</TableCell>
                          <TableCell>{dataBr(m.ultimaCompra)}</TableCell>
                          <TableCell>
                            <StatusDot active={m.ativo} />
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

        <TabsContent value="sugestao">
          <Card>
            <CardContent>
              <SugestaoCompraCalculadaTabela
                data={sugestaoCalculada}
                isLoading={sugestaoLoading}
                isError={sugestaoError}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NotaSaidaSheet id={notaSelecionadaId} onOpenChange={(o) => !o && setNotaSelecionadaId(null)} />
      <NotaEntradaSheet
        id={devolucaoSelecionadaId}
        onOpenChange={(o) => !o && setDevolucaoSelecionadaId(null)}
      />
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
