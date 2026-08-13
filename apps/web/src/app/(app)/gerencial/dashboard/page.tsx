"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DashboardGerencial,
  DashboardGerencialClientesSemVendedor,
  DashboardGerencialVendedor,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Banknote,
  SlidersHorizontal,
  Ticket,
  Undo2,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 4 + i);
const TODOS = "todos";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const percento = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
/** Data ISO do back → dd/mm/aaaa, sem hora: a granularidade útil aqui é o dia. */
const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

interface Filtros {
  mes: number;
  ano: number;
  vendedorId: string;
  mostrarValores: boolean;
}

/**
 * Cartão de indicador do topo — mesma anatomia do Dashboard Comercial. Com
 * `onClick` ele vira um <button> de verdade (foco e teclado de graça), em vez
 * de uma div com handler que só o mouse alcança.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  gradient,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  suffix: React.ReactNode;
  gradient: string;
  onClick?: () => void;
}) {
  const Elemento = onClick ? "button" : "div";
  return (
    <Elemento
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`relative overflow-hidden rounded-xl bg-linear-to-br p-4 text-left text-white shadow-md ${gradient} ${
        onClick
          ? "cursor-pointer transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          : ""
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-white/10 blur-xl"
      />
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold tracking-wider uppercase opacity-90">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-lg bg-white/20">
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs opacity-80">{suffix}</p>
    </Elemento>
  );
}

/**
 * Barra de progresso do vendedor contra a própria meta. A cor é semântica (o
 * quanto falta), não identidade: vermelho abaixo de 25%, âmbar até 75%, azul
 * até bater e verde quando passa — e o número vem escrito ao lado, porque cor
 * sozinha não informa quem não a distingue.
 */
function BarraMeta({ perc }: { perc: number }) {
  const largura = Math.min(100, Math.max(0, perc));
  const cor =
    perc >= 100
      ? "bg-success"
      : perc >= 75
        ? "bg-primary"
        : perc >= 25
          ? "bg-amber-500"
          : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums">{percento(perc)}</span>
    </div>
  );
}

/**
 * Dashboard Gerencial: como o mês está indo, vendedor a vendedor — objetivo e
 * realizado em valor e em positivação de clientes.
 *
 * Os parâmetros ficam na cortina, como nas Consultas: mexer num select não
 * deve custar uma agregação de mês inteiro no banco, então a tela só consulta
 * quando o Aplicar fecha a cortina.
 *
 * "Mostrar valores" é só de exibição: esconde os números absolutos (metas,
 * faturamento e contagem de clientes) para a tabela poder ser mostrada em
 * reunião expondo apenas o quanto cada um atingiu da própria meta.
 */
export default function DashboardGerencialPage() {
  const hoje = new Date();
  const filtrosIniciais: Filtros = {
    mes: hoje.getMonth() + 1,
    ano: hoje.getFullYear(),
    vendedorId: TODOS,
    mostrarValores: true,
  };
  // `filtros` é o que está valendo; `rascunho` é o que a cortina edita.
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [rascunho, setRascunho] = useState<Filtros>(filtrosIniciais);
  const [cortinaAberta, setCortinaAberta] = useState(false);
  // Linha clicada: abre o detalhe por categoria daquele vendedor.
  const [detalheVendedorId, setDetalheVendedorId] = useState<string | null>(null);
  const [listaSemVendedor, setListaSemVendedor] = useState(false);

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["objetivos", "dashboard-gerencial", filtros.mes, filtros.ano, filtros.vendedorId],
    queryFn: () =>
      apiFetch<DashboardGerencial>("/objetivos/dashboard-gerencial", {
        query: {
          mes: filtros.mes,
          ano: filtros.ano,
          ...(filtros.vendedorId === TODOS ? {} : { vendedorId: filtros.vendedorId }),
        },
      }),
  });

  const detalhe = useQuery({
    queryKey: [
      "objetivos",
      "dashboard-gerencial",
      "vendedor",
      detalheVendedorId,
      filtros.mes,
      filtros.ano,
    ],
    queryFn: () =>
      apiFetch<DashboardGerencialVendedor>(
        `/objetivos/dashboard-gerencial/vendedor/${detalheVendedorId}`,
        { query: { mes: filtros.mes, ano: filtros.ano } },
      ),
    enabled: detalheVendedorId !== null,
  });

  // Independe do período: a carteira sem dono é do cadastro, não do mês.
  const semVendedor = useQuery({
    queryKey: ["objetivos", "dashboard-gerencial", "clientes-sem-vendedor"],
    queryFn: () =>
      apiFetch<DashboardGerencialClientesSemVendedor>(
        "/objetivos/dashboard-gerencial/clientes-sem-vendedor",
      ),
    enabled: listaSemVendedor,
  });

  const abrirCortina = (aberta: boolean) => {
    // Reabrir depois de fechar sem aplicar precisa mostrar o que está valendo,
    // não o rascunho abandonado.
    if (aberta) setRascunho(filtros);
    setCortinaAberta(aberta);
  };

  const aplicarFiltros = () => {
    setFiltros(rascunho);
    setCortinaAberta(false);
  };

  const mostrarValores = filtros.mostrarValores;
  const resumo = data?.resumo;

  const nomeVendedorFiltrado =
    filtros.vendedorId === TODOS
      ? null
      : (opcoesVendedor.find((v) => v.id === filtros.vendedorId)?.nomeReduzido ?? null);
  const quantidadeFiltros = [
    filtros.vendedorId !== TODOS,
    !filtros.mostrarValores,
  ].filter(Boolean).length;

  const linhas = data?.linhas ?? [];
  const soma = {
    positivacaoObjetivo: linhas.reduce((acc, l) => acc + l.positivacaoObjetivo, 0),
    positivacaoRealizado: linhas.reduce((acc, l) => acc + l.positivacaoRealizado, 0),
    objetivo: linhas.reduce((acc, l) => acc + l.objetivo, 0),
    realizado: linhas.reduce((acc, l) => acc + l.realizado, 0),
  };
  // % do total: a razão entre as somas, não a média dos percentuais de cada
  // vendedor — quem tem meta maior pesa mais, como na leitura da diretoria.
  const percTotal =
    soma.objetivo > 0 ? (soma.realizado / soma.objetivo) * 100 : 0;
  const percPositivacaoTotal =
    soma.positivacaoObjetivo > 0
      ? (soma.positivacaoRealizado / soma.positivacaoObjetivo) * 100
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard Gerencial</h1>
          <p className="text-sm text-muted-foreground">
            Objetivo, realizado e positivação por vendedor
            {data ? ` — ${data.periodo.label}` : ""}
            {nomeVendedorFiltrado ? ` · ${nomeVendedorFiltrado}` : ""}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => abrirCortina(true)}>
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
              <div className="flex items-center gap-2">
                <Switch
                  id="mostrar-valores"
                  checked={rascunho.mostrarValores}
                  onCheckedChange={(v) => setRascunho((r) => ({ ...r, mostrarValores: v }))}
                />
                <Label htmlFor="mostrar-valores" className="cursor-pointer text-sm">
                  Mostrar valores
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Desligado, a tabela esconde objetivo, realizado e a contagem de clientes,
                deixando visível apenas o percentual atingido de cada vendedor.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={aplicarFiltros}>Aplicar</Button>
              <Button variant="ghost" onClick={() => setRascunho(filtrosIniciais)}>
                Limpar
              </Button>
            </div>
          </div>
        </ResizableSheetContent>
      </Sheet>

      {isLoading || !resumo ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            icon={Banknote}
            label="Realizado"
            value={moeda(resumo.realizado)}
            suffix={`${percento(resumo.percRealizado)} de ${moeda(resumo.objetivo)}`}
            gradient="from-blue-500 to-blue-600"
          />
          <StatCard
            icon={Users}
            label="Clientes"
            value={inteiro(resumo.clientesPositivados)}
            suffix={`${percento(resumo.percClientes)} de ${inteiro(resumo.objetivoClientes)}`}
            gradient="from-emerald-500 to-emerald-600"
          />
          <StatCard
            icon={Undo2}
            label="Devolução"
            value={moeda(resumo.devolucao)}
            suffix="Total no período"
            gradient="from-red-500 to-red-600"
          />
          <StatCard
            icon={Wallet}
            label="Base"
            value={inteiro(resumo.clientesPositivados)}
            suffix={`${percento(resumo.percBase)} de ${inteiro(resumo.baseTotal)}`}
            gradient="from-amber-400 to-amber-500"
          />
          <StatCard
            icon={UserRoundX}
            label="Clientes"
            value={inteiro(resumo.clientesSemVendedor)}
            suffix={
              resumo.clientesSemVendedor > 0 ? "Sem vendedor ativo — ver lista" : "Sem vendedor ativo"
            }
            gradient="from-orange-500 to-orange-600"
            onClick={
              resumo.clientesSemVendedor > 0
                ? () => setListaSemVendedor(true)
                : undefined
            }
          />
          <StatCard
            icon={Ticket}
            label="Ticket"
            value={moeda(resumo.ticketMedio)}
            suffix={`Médio em ${inteiro(resumo.totalNotas)} ${resumo.totalNotas === 1 ? "nota" : "notas"}`}
            gradient="from-amber-500 to-orange-500"
          />
        </div>
      )}

      <Card>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vendedor com meta ou movimento no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    {mostrarValores && <TableHead className="text-right">Positivação</TableHead>}
                    {mostrarValores && (
                      <TableHead className="text-right">Posit. realizada</TableHead>
                    )}
                    <TableHead className="w-52">% Positivação</TableHead>
                    {mostrarValores && <TableHead className="text-right">Objetivo</TableHead>}
                    {mostrarValores && <TableHead className="text-right">Realizado</TableHead>}
                    <TableHead className="w-52">% Realizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow
                      key={l.vendedorId}
                      className="cursor-pointer"
                      onClick={() => setDetalheVendedorId(l.vendedorId)}
                    >
                      <TableCell className="font-medium">{l.nome}</TableCell>
                      {mostrarValores && (
                        <TableCell className="text-right tabular-nums">
                          {inteiro(l.positivacaoObjetivo)}
                        </TableCell>
                      )}
                      {mostrarValores && (
                        <TableCell className="text-right tabular-nums">
                          {inteiro(l.positivacaoRealizado)}
                        </TableCell>
                      )}
                      <TableCell>
                        {l.positivacaoObjetivo > 0 ? (
                          <BarraMeta perc={l.percPositivacao} />
                        ) : (
                          <span className="text-xs text-muted-foreground">sem meta</span>
                        )}
                      </TableCell>
                      {mostrarValores && (
                        <TableCell className="text-right tabular-nums">
                          {moeda(l.objetivo)}
                        </TableCell>
                      )}
                      {mostrarValores && (
                        <TableCell className="text-right tabular-nums">
                          {moeda(l.realizado)}
                        </TableCell>
                      )}
                      <TableCell>
                        {l.objetivo > 0 ? (
                          <BarraMeta perc={l.percRealizado} />
                        ) : (
                          <span className="text-xs text-muted-foreground">sem meta</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">
                      {linhas.length} {linhas.length === 1 ? "vendedor" : "vendedores"}
                    </TableCell>
                    {mostrarValores && (
                      <TableCell className="text-right font-medium tabular-nums">
                        {inteiro(soma.positivacaoObjetivo)}
                      </TableCell>
                    )}
                    {mostrarValores && (
                      <TableCell className="text-right font-medium tabular-nums">
                        {inteiro(soma.positivacaoRealizado)}
                      </TableCell>
                    )}
                    <TableCell>
                      {soma.positivacaoObjetivo > 0 ? (
                        <BarraMeta perc={percPositivacaoTotal} />
                      ) : (
                        <span className="text-xs text-muted-foreground">sem meta</span>
                      )}
                    </TableCell>
                    {mostrarValores && (
                      <TableCell className="text-right font-medium tabular-nums">
                        {moeda(soma.objetivo)}
                      </TableCell>
                    )}
                    {mostrarValores && (
                      <TableCell className="text-right font-medium tabular-nums">
                        {moeda(soma.realizado)}
                      </TableCell>
                    )}
                    <TableCell>
                      {soma.objetivo > 0 ? (
                        <BarraMeta perc={percTotal} />
                      ) : (
                        <span className="text-xs text-muted-foreground">sem meta</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhe da linha: o mês daquele vendedor repartido por categoria. */}
      <Sheet
        open={detalheVendedorId !== null}
        onOpenChange={(aberta) => {
          if (!aberta) setDetalheVendedorId(null);
        }}
      >
        <ResizableSheetContent defaultWidth={560}>
          <SheetHeader>
            <SheetTitle>
              {detalhe.data ? detalhe.data.nome : "Detalhe do vendedor"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {detalhe.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : detalhe.isError || !detalhe.data ? (
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar o detalhe do vendedor.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Período</p>
                    <p className="font-medium">{detalhe.data.periodo.label}</p>
                  </div>
                  {mostrarValores && (
                    <div>
                      <p className="text-xs text-muted-foreground">Objetivo</p>
                      <p className="font-medium tabular-nums">
                        {moeda(detalhe.data.objetivo)}
                      </p>
                    </div>
                  )}
                  {mostrarValores && (
                    <div>
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className="font-medium tabular-nums">
                        {moeda(detalhe.data.realizado)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">% Realizado</p>
                    <p className="font-medium tabular-nums">
                      {percento(detalhe.data.percRealizado)}
                    </p>
                  </div>
                </div>

                {detalhe.data.categorias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma meta por categoria nem venda no período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        {mostrarValores && (
                          <TableHead className="text-right">Objetivo</TableHead>
                        )}
                        {mostrarValores && (
                          <TableHead className="text-right">Realizado</TableHead>
                        )}
                        <TableHead className="w-44">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.data.categorias.map((c) => (
                        <TableRow key={c.categoriaId}>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.codigoErp}
                            </span>{" "}
                            {c.descricao}
                          </TableCell>
                          {mostrarValores && (
                            <TableCell className="text-right tabular-nums">
                              {moeda(c.objetivo)}
                            </TableCell>
                          )}
                          {mostrarValores && (
                            <TableCell className="text-right tabular-nums">
                              {moeda(c.realizado)}
                            </TableCell>
                          )}
                          <TableCell>
                            {c.objetivo > 0 ? (
                              <BarraMeta perc={c.percRealizado} />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                sem meta
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Item sem produto vinculado não cai em categoria nenhuma, mas
                    conta no realizado do mês — dizer isso evita a leitura de que
                    a tabela "não fecha" com o total da linha. */}
                {detalhe.data.realizadoSemCategoria > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {mostrarValores
                      ? `${moeda(detalhe.data.realizadoSemCategoria)} realizados em itens sem categoria — contam no total do vendedor, mas não aparecem acima.`
                      : "Há realizado em itens sem categoria, que conta no total do vendedor mas não aparece acima."}
                  </p>
                )}
              </>
            )}
          </div>
        </ResizableSheetContent>
      </Sheet>

      {/* Detalhe do card: quem são os clientes que ninguém está atendendo. */}
      <Sheet open={listaSemVendedor} onOpenChange={setListaSemVendedor}>
        <ResizableSheetContent defaultWidth={720}>
          <SheetHeader>
            <SheetTitle>Clientes sem vendedor ativo</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            {semVendedor.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : semVendedor.isError || !semVendedor.data ? (
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar a lista.
              </p>
            ) : semVendedor.data.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente ativo sem vendedor ativo.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {semVendedor.data.total > semVendedor.data.linhas.length
                    ? `Mostrando ${inteiro(semVendedor.data.linhas.length)} de ${inteiro(semVendedor.data.total)} clientes, dos que compraram mais recentemente.`
                    : `${inteiro(semVendedor.data.total)} ${semVendedor.data.total === 1 ? "cliente" : "clientes"}, do que comprou mais recentemente para o mais antigo.`}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>CNPJ/CPF</TableHead>
                      <TableHead className="text-right">Última compra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semVendedor.data.linhas.map((c) => (
                      <TableRow key={c.clienteId}>
                        <TableCell className="font-mono text-xs">
                          {c.codigo ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.cnpjCpf || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {dataCurta(c.ultimaCompra)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </ResizableSheetContent>
      </Sheet>
    </div>
  );
}
