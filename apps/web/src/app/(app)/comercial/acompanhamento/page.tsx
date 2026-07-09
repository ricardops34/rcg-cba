"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp, Percent, Users } from "lucide-react";
import type { AcompanhamentoResponse, Meta } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const hoje = new Date();

export default function AcompanhamentoPage() {
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [defaultApplied, setDefaultApplied] = useState(false);

  const { data: ultima } = useQuery({
    queryKey: ["metas", "ultimo-periodo"],
    queryFn: () => apiFetch<{ data: Meta[] }>("/metas", { query: { pageSize: 1 } }),
  });
  useEffect(() => {
    const m = ultima?.data[0];
    if (m && !defaultApplied) {
      setAno(m.ano);
      setMes(m.mes);
      setDefaultApplied(true);
    }
  }, [ultima, defaultApplied]);

  const { data, isLoading } = useQuery({
    queryKey: ["acompanhamento", ano, mes],
    queryFn: () => apiFetch<AcompanhamentoResponse>("/metas/acompanhamento", { query: { ano, mes } }),
  });

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - i);

  const totalObjetivo = data?.totalObjetivo ?? 0;
  const totalRealizado = data?.totalRealizado ?? 0;

  const kpis = [
    { label: "Objetivo do mês", value: brl(totalObjetivo), icon: Target, tone: "from-blue-600 to-blue-700" },
    { label: "Realizado", value: brl(totalRealizado), icon: TrendingUp, tone: "from-emerald-500 to-emerald-600" },
    { label: "% da meta", value: `${Math.round(data?.percentualGeral ?? 0)}%`, icon: Percent, tone: "from-amber-500 to-orange-600" },
    { label: "Vendedores c/ meta", value: `${data?.comMeta ?? 0}/${data?.totalVendedores ?? 0}`, icon: Users, tone: "from-cyan-500 to-cyan-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((label, i) => (<SelectItem key={i} value={String(i + 1)}>{label}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map((a) => (<SelectItem key={a} value={String(a)}>{a}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`relative overflow-hidden rounded-xl bg-linear-to-br p-4 text-white shadow-md ${k.tone}`}>
            <div aria-hidden className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-white/10 blur-xl" />
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold tracking-wider uppercase opacity-90">{k.label}</p>
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/20"><k.icon className="size-4.5" /></span>
            </div>
            {isLoading ? <Skeleton className="mt-2 h-8 w-24 bg-white/25" /> : <p className="mt-1 text-2xl font-bold tracking-tight">{k.value}</p>}
          </div>
        ))}
      </div>

      {/* Ranking de vendedores */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">Ranking de vendedores — {MESES[mes - 1]}/{ano}</h2>
            <p className="text-xs text-muted-foreground">Objetivo x realizado da equipe supervisionada</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Positiv.</TableHead>
                  <TableHead className="text-right">Objetivo</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="w-40">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full max-w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && (data?.linhas.length ?? 0) === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Nenhum vendedor com meta neste período.
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  data?.linhas.map((l, i) => {
                    const p = Math.round(l.percentual);
                    const tone = p >= 100 ? "bg-emerald-500" : p >= 60 ? "bg-blue-500" : p >= 30 ? "bg-amber-500" : "bg-red-500";
                    return (
                      <TableRow key={l.colaboradorId}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{l.nomeReduzido || l.nome}</p>
                          <p className="text-xs text-muted-foreground">{l.codigoErp ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.clientesPositivados}/{l.metaClientes || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(l.valorObjetivo)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{brl(l.valorRealizado)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(p, 100)}%` }} />
                            </div>
                            <span className="w-9 text-right text-xs font-medium tabular-nums">{p}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
              {!isLoading && (data?.linhas.length ?? 0) > 0 && (
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{brl(totalObjetivo)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{brl(totalRealizado)}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{Math.round(data?.percentualGeral ?? 0)}%</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
      </div>
    </div>
  );
}
