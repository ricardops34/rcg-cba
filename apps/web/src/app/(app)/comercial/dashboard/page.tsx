"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import type { ObjetivoDashboard, ObjetivoDashboardCategoria } from "@plataforma/contracts";
import { DashboardCategoriaDetalhe } from "@/components/comercial/dashboard-categoria-detalhe";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote, ChevronRight, SlidersHorizontal, ThumbsUp, Undo2, Users } from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 4 + i);
const TODOS = "todos";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Parte do total, com uma casa (ex.: 23,8%). */
const percentual = (v: number, total: number) =>
  total
    ? `${((v / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : "—";
const inteiro = (v: number) => v.toLocaleString("pt-BR");

/** Variação sobre o mês anterior, com seta (ex.: "▲ 12,3%"). */
function variacao(atual: number, anterior: number) {
  if (!anterior) return atual ? "novo" : "—";
  const v = ((atual - anterior) / Math.abs(anterior)) * 100;
  const seta = v > 0 ? "▲" : v < 0 ? "▼" : "=";
  return `${seta} ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * "Comparar com o mês anterior" (20/11/2026): lembrado no navegador, por
 * usuário — como o tamanho das listagens.
 */
const chaveMesAnterior = (usuarioId?: string) =>
  usuarioId ? `dashboard-comercial:mes-anterior:${usuarioId}` : null;
function lerMesAnterior(chave: string | null) {
  if (!chave) return false;
  try {
    return window.localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}
function gravarMesAnterior(chave: string | null, valor: boolean) {
  if (!chave) return;
  try {
    window.localStorage.setItem(chave, valor ? "1" : "0");
  } catch {
    // navegador sem armazenamento: vale só nesta visita
  }
}

interface Filtros {
  mes: number;
  ano: number;
  vendedorId: string;
  municipio: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  anterior,
  gradient,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  suffix: React.ReactNode;
  /** Linha do mês anterior (opção dos parâmetros). */
  anterior?: React.ReactNode;
  gradient: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-linear-to-br p-3 sm:p-4 text-white shadow-md ${gradient}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-white/10 blur-xl"
      />
      <div className="flex items-start justify-between">
        <p className="min-w-0 text-[11px] font-semibold tracking-wider uppercase opacity-90 sm:text-xs">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20 sm:size-9">
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-1 min-w-0 break-words text-lg font-bold tracking-tight sm:text-xl xl:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs opacity-80">{suffix}</p>
      {anterior && <p className="mt-1 border-t border-white/20 pt-1 text-xs opacity-90">{anterior}</p>}
    </div>
  );
}

export default function DashboardComercialPage() {
  const hoje = new Date();
  const filtrosIniciais: Filtros = {
    mes: hoje.getMonth() + 1,
    ano: hoje.getFullYear(),
    vendedorId: TODOS,
    municipio: TODOS,
  };

  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [rascunho, setRascunho] = useState<Filtros>(filtrosIniciais);
  const [cortinaAberta, setCortinaAberta] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<ObjetivoDashboardCategoria | null>(null);
  const usuarioId = useAuthStore((s) => s.user?.id);
  const chaveComparar = chaveMesAnterior(usuarioId);
  const [compararLembrado, setCompararLembrado] = useState(() => ({
    chave: chaveComparar,
    valor: lerMesAnterior(chaveComparar),
  }));
  const comparar =
    compararLembrado.chave === chaveComparar ? compararLembrado.valor : lerMesAnterior(chaveComparar);
  const [compararRascunho, setCompararRascunho] = useState(comparar);

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  // Opções de município do rascunho (em tempo real enquanto ajusta os selects)
  const rascunhoVendedorId = rascunho.vendedorId === TODOS ? undefined : rascunho.vendedorId;
  const municipiosQuery = useQuery({
    queryKey: ["objetivos", "dashboard", "municipios", rascunho.mes, rascunho.ano, rascunhoVendedorId],
    queryFn: () =>
      apiFetch<string[]>("/objetivos/dashboard/municipios", {
        query: { mes: rascunho.mes, ano: rascunho.ano, ...(rascunhoVendedorId ? { vendedorId: rascunhoVendedorId } : {}) },
      }),
  });
  const opcoesMunicipio = municipiosQuery.data ?? [];
  const rascunhoMunicipioValido =
    rascunho.municipio !== TODOS && opcoesMunicipio.includes(rascunho.municipio)
      ? rascunho.municipio
      : TODOS;

  const vendedorIdQuery = filtros.vendedorId === TODOS ? undefined : filtros.vendedorId;
  const municipioQuery = filtros.municipio === TODOS ? undefined : filtros.municipio;

  const { data, isLoading } = useQuery({
    queryKey: ["objetivos", "dashboard", filtros.mes, filtros.ano, vendedorIdQuery, municipioQuery],
    queryFn: () =>
      apiFetch<ObjetivoDashboard>("/objetivos/dashboard", {
        query: {
          mes: filtros.mes,
          ano: filtros.ano,
          ...(vendedorIdQuery ? { vendedorId: vendedorIdQuery } : {}),
          ...(municipioQuery ? { municipio: municipioQuery } : {}),
        },
      }),
  });
  // Mês anterior, com os mesmos filtros (só com a opção ligada).
  const mesAnterior = filtros.mes === 1 ? 12 : filtros.mes - 1;
  const anoAnterior = filtros.mes === 1 ? filtros.ano - 1 : filtros.ano;
  const { data: anterior } = useQuery({
    queryKey: ["objetivos", "dashboard", mesAnterior, anoAnterior, vendedorIdQuery, municipioQuery],
    queryFn: () =>
      apiFetch<ObjetivoDashboard>("/objetivos/dashboard", {
        query: {
          mes: mesAnterior,
          ano: anoAnterior,
          ...(vendedorIdQuery ? { vendedorId: vendedorIdQuery } : {}),
          ...(municipioQuery ? { municipio: municipioQuery } : {}),
        },
      }),
    enabled: comparar,
  });
  const ant = comparar ? anterior : undefined;
  const rotuloAnterior = `${MESES[mesAnterior - 1].slice(0, 3)}/${anoAnterior}`;
  const anteriorPorCategoria = new Map((ant?.categorias ?? []).map((c) => [c.categoriaId, c.realizado]));

  // Base do "% do total" da tabela de categorias: a soma das linhas, a mesma do rodapé.
  const totalCategorias = (data?.categorias ?? []).reduce((acc, c) => acc + c.realizado, 0);

  const abrirCortina = (aberta: boolean) => {
    if (aberta) {
      setRascunho(filtros);
      setCompararRascunho(comparar);
    }
    setCortinaAberta(aberta);
  };

  const aplicarFiltros = () => {
    setFiltros({
      ...rascunho,
      municipio: rascunhoMunicipioValido,
    });
    setCompararLembrado({ chave: chaveComparar, valor: compararRascunho });
    gravarMesAnterior(chaveComparar, compararRascunho);
    setCortinaAberta(false);
  };

  const nomeVendedorFiltrado =
    filtros.vendedorId === TODOS
      ? null
      : (opcoesVendedor.find((v) => v.id === filtros.vendedorId)?.nomeReduzido ?? null);

  const quantidadeFiltros = [
    filtros.vendedorId !== TODOS,
    filtros.municipio !== TODOS,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour="dashboard-comercial-cabecalho">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard Comercial</h1>
          <p className="text-sm text-muted-foreground">
            Objetivo vs. realizado no período selecionado
            {data ? ` — ${MESES[filtros.mes - 1]}/${filtros.ano}` : ""}
            {data?.municipio ? ` — ${data.municipio}` : ""}
            {nomeVendedorFiltrado ? ` · ${nomeVendedorFiltrado}` : ""}.
            {data?.municipio
              ? " Com município filtrado, o objetivo segue sendo o do vendedor no mês: a meta é cadastrada por vendedor, não por cidade."
              : ""}
          </p>
        </div>
        <Button data-tour="dashboard-comercial-parametros" variant="outline" size="sm" onClick={() => abrirCortina(true)}>
          <SlidersHorizontal className="size-4" />
          Parâmetros
          {quantidadeFiltros > 0 && (
            <Badge variant="secondary" className="ml-1">
              {quantidadeFiltros}
            </Badge>
          )}
        </Button>
      </div>

      <Sheet open={cortinaAberta} onOpenChange={abrirCortina}>
        <ResizableSheetContent defaultWidth={420}>
          <SheetHeader>
            <SheetTitle>Parâmetros do dashboard</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Período</p>
              <div className="flex gap-2">
                <Select
                  value={String(rascunho.mes)}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, mes: Number(v) }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((nome, i) => (
                      <SelectItem key={nome} value={String(i + 1)}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(rascunho.ano)}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, ano: Number(v) }))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANOS.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Vendedor</p>
              <Select
                value={rascunho.vendedorId}
                onValueChange={(v) => setRascunho((r) => ({ ...r, vendedorId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {opcoesVendedor.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vendedorFiltroLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Município</p>
              <Select
                value={rascunhoMunicipioValido}
                onValueChange={(v) => setRascunho((r) => ({ ...r, municipio: v }))}
                disabled={municipiosQuery.isLoading || opcoesMunicipio.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {opcoesMunicipio.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={compararRascunho}
                onCheckedChange={(v) => setCompararRascunho(v === true)}
              />
              <span>
                Comparar com o mês anterior
                <span className="block text-xs text-muted-foreground">
                  Mostra o valor do mês anterior e a variação nos cartões e nas categorias. Fica
                  lembrado neste navegador.
                </span>
              </span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button onClick={aplicarFiltros}>Aplicar</Button>
              <Button variant="ghost" onClick={() => setRascunho(filtrosIniciais)}>
                Limpar
              </Button>
            </div>
          </div>
        </ResizableSheetContent>
      </Sheet>

      <div data-tour="dashboard-comercial-resultados">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
              <StatCard
                icon={Banknote}
                label="Sugestão de Venda"
                value={moeda(data.realizadoValor)}
                suffix={`${data.percRealizado}% de ${moeda(data.objetivoValor)}`}
                anterior={ant && `${rotuloAnterior}: ${moeda(ant.realizadoValor)} · ${variacao(data.realizadoValor, ant.realizadoValor)}`}
                gradient="from-blue-600 to-blue-700"
              />
              <StatCard
                icon={Users}
                label="Clientes"
                value={inteiro(data.clientesPositivados)}
                suffix={`${data.percClientes}% de ${inteiro(data.objetivoClientes)}`}
                anterior={ant && `${rotuloAnterior}: ${inteiro(ant.clientesPositivados)} · ${variacao(data.clientesPositivados, ant.clientesPositivados)}`}
                gradient="from-emerald-500 to-emerald-600"
              />
              <StatCard
                icon={Undo2}
                label="Devolução"
                value={moeda(data.devolucaoTotal)}
                suffix="Total"
                anterior={ant && `${rotuloAnterior}: ${moeda(ant.devolucaoTotal)} · ${variacao(data.devolucaoTotal, ant.devolucaoTotal)}`}
                gradient="from-violet-500 to-violet-600"
              />
              <StatCard
                icon={ThumbsUp}
                label="Base"
                value={inteiro(data.clientesPositivados)}
                suffix={`${data.percBase}% de ${inteiro(data.baseTotal)}`}
                anterior={ant && `${rotuloAnterior}: ${ant.percBase}% de ${inteiro(ant.baseTotal)}`}
                gradient="from-amber-500 to-orange-600"
              />
            </div>

            <Card data-tour="dashboard-comercial-categorias">
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Vendas Categoria</p>
                  <p className="text-xs text-muted-foreground">
                    Clique na categoria para ver os produtos e os clientes que compõem o valor.
                  </p>
                </div>
                {data.categorias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Realizado</TableHead>
                        <TableHead className="w-28 text-right">% do total</TableHead>
                        {ant && (
                          <>
                            <TableHead className="text-right">{rotuloAnterior}</TableHead>
                            <TableHead className="w-24 text-right">Var.</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.categorias.map((c) => (
                        <TableRow
                          key={c.categoriaId}
                          className="cursor-pointer"
                          tabIndex={0}
                          title="Ver produtos e clientes da categoria"
                          onClick={() => setCategoriaAberta(c)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setCategoriaAberta(c);
                            }
                          }}
                        >
                          <TableCell className="font-mono text-xs">{c.codigoErp}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              {c.descricao}
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{moeda(c.realizado)}</TableCell>
                          {/* Participação da categoria no total da tabela (20/11/2026). */}
                          <TableCell className="text-right tabular-nums">
                            {percentual(c.realizado, totalCategorias)}
                          </TableCell>
                          {ant && (
                            <>
                              <TableCell className="text-right text-muted-foreground tabular-nums">
                                {moeda(anteriorPorCategoria.get(c.categoriaId) ?? 0)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {variacao(c.realizado, anteriorPorCategoria.get(c.categoriaId) ?? 0)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{moeda(totalCategorias)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {totalCategorias ? "100,0%" : "—"}
                        </TableCell>
                        {ant && (
                          <>
                            <TableCell className="text-right tabular-nums">
                              {moeda((ant.categorias ?? []).reduce((a, c) => a + c.realizado, 0))}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {variacao(
                                totalCategorias,
                                (ant.categorias ?? []).reduce((a, c) => a + c.realizado, 0),
                              )}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      <DashboardCategoriaDetalhe
        aberto={categoriaAberta !== null}
        categoria={categoriaAberta}
        filtros={{ mes: filtros.mes, ano: filtros.ano, vendedorId: vendedorIdQuery, municipio: municipioQuery }}
        recorte={[
          `${MESES[filtros.mes - 1]}/${filtros.ano}`,
          municipioQuery,
          nomeVendedorFiltrado,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={() => setCategoriaAberta(null)}
      />
    </div>
  );
}
