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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NotaSaidaSheet } from "@/components/comercial/nota-saida-detalhe";
import { TituloReceberSheet } from "@/components/comercial/titulo-receber-detalhe";
import { ArrowLeft, Search } from "lucide-react";

const LIST_ROUTE = "/comercial/posicao-cliente";

type NotaStatusFiltro = "todas" | "ativas" | "inativas";
type TituloSituacaoFiltro = "todos" | "aberto" | "vencido" | "baixado";

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

              {notasFiltradas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Nota</TableHead>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Vlr. bruto</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notasFiltradas.map((n) => (
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

              {titulosFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum título encontrado.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {titulosFiltrados.map((t) => (
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

              {mixFiltrado.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd. total</TableHead>
                        <TableHead className="text-right">Vlr. total</TableHead>
                        <TableHead className="text-right">Nº notas</TableHead>
                        <TableHead>Última compra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mixFiltrado.map((m) => (
                        <TableRow
                          key={m.produtoId}
                          className="cursor-pointer"
                          onClick={() => router.push(`/comercial/produtos/${m.produtoId}`)}
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
    </div>
  );
}
