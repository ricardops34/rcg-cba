"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ObjetivoDashboard } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote, Search, ThumbsUp, Undo2, Users } from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 4 + i);

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v: number) => v.toLocaleString("pt-BR");

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  gradient,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  suffix: React.ReactNode;
  gradient: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-linear-to-br p-4 text-white shadow-md ${gradient}`}
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
    </div>
  );
}

export default function DashboardComercialPage() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [filtros, setFiltros] = useState({ mes, ano, vendedorId });

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  // Usuário com vendedor vinculado: a tela abre já filtrada pra própria
  // carteira em vez de "Todos" — só na primeira carga, não sobrescreve se o
  // usuário voltar pra "Todos" manualmente depois.
  useVendedorPadrao(vendedoresEscopoQuery.data?.meuVendedorId, (id) => {
    setVendedorId(id);
    setFiltros((f) => ({ ...f, vendedorId: id }));
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["objetivos", "dashboard", filtros],
    queryFn: () =>
      apiFetch<ObjetivoDashboard>("/objetivos/dashboard", {
        query: {
          mes: filtros.mes,
          ano: filtros.ano,
          ...(filtros.vendedorId ? { vendedorId: filtros.vendedorId } : {}),
        },
      }),
  });

  const buscar = () => setFiltros({ mes, ano, vendedorId });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard Comercial</h1>
        <p className="text-sm text-muted-foreground">Objetivo vs. realizado no período selecionado.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-40 space-y-1.5">
            <FieldLabel>Mês</FieldLabel>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-full">
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
          </div>

          <div className="w-28 space-y-1.5">
            <FieldLabel>Ano</FieldLabel>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-full">
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

          <div className="w-56 space-y-1.5">
            <FieldLabel>Vendedor</FieldLabel>
            <Select
              value={vendedorId ?? "none"}
              onValueChange={(v) => setVendedorId(v === "none" ? undefined : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todos</SelectItem>
                {opcoesVendedor.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {vendedorFiltroLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={buscar} disabled={isFetching}>
            <Search className="size-4" />
            Buscar
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Banknote}
              label="Sugestão de Venda"
              value={moeda(data.realizadoValor)}
              suffix={`${data.percRealizado}% de ${moeda(data.objetivoValor)}`}
              gradient="from-blue-600 to-blue-700"
            />
            <StatCard
              icon={Users}
              label="Clientes"
              value={inteiro(data.clientesPositivados)}
              suffix={`${data.percClientes}% de ${inteiro(data.objetivoClientes)}`}
              gradient="from-emerald-500 to-emerald-600"
            />
            <StatCard
              icon={Undo2}
              label="Devolução"
              value={moeda(data.devolucaoTotal)}
              suffix="Total"
              gradient="from-violet-500 to-violet-600"
            />
            <StatCard
              icon={ThumbsUp}
              label="Base"
              value={inteiro(data.clientesPositivados)}
              suffix={`${data.percBase}% de ${inteiro(data.baseTotal)}`}
              gradient="from-amber-500 to-orange-600"
            />
          </div>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm font-semibold">Vendas Categoria</p>
              {data.categorias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Realizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.categorias.map((c) => (
                      <TableRow key={c.categoriaId}>
                        <TableCell className="font-mono text-xs">{c.codigoErp}</TableCell>
                        <TableCell>{c.descricao}</TableCell>
                        <TableCell className="text-right">{moeda(c.realizado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">
                        {moeda(data.categorias.reduce((acc, c) => acc + c.realizado, 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
