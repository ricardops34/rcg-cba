"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  SMS_MOTIVO_ROTULO,
  type SmsEnvioLinha,
  type SmsEstatisticas,
  type SmsMotivo,
  type SmsSituacao,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { SmsConfiguracaoCard } from "@/components/admin/sms-configuracao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraficoColunas } from "@/components/graficos/grafico-colunas";
import { GraficoParticipacao } from "@/components/graficos/grafico-participacao";
import { FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, MessageSquareReply } from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const SITUACAO_ROTULO: Record<SmsSituacao, string> = {
  entregue: "Entregue",
  falha: "Falha",
  aguardando: "Aguardando",
};

const SITUACAO_VARIANTE: Record<SmsSituacao, "default" | "destructive" | "secondary"> = {
  entregue: "default",
  falha: "destructive",
  aguardando: "secondary",
};

const numero = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

const dataHora = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Metrica({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="space-y-0.5">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Administração > SMS (docs/planos/2026-10-01-sms-iagente.md): saldo e URL do
 * webhook da iAgente, e estatística e histórico dos envios por ano/mês, com
 * as respostas dos clientes. O token fica em Parâmetros, ao lado do SMTP.
 */
export default function SmsPage() {
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState<string>(() => String(new Date().getMonth() + 1));
  const [motivo, setMotivo] = useState<string>("todos");
  const [situacao, setSituacao] = useState<string>("todas");
  const [page, setPage] = useState(1);

  const filtro = {
    ano,
    ...(mes !== "ano" ? { mes: Number(mes) } : {}),
    ...(motivo !== "todos" ? { motivo } : {}),
  };

  const estatisticas = useQuery({
    queryKey: ["sms", "estatisticas", filtro],
    queryFn: () => apiFetch<SmsEstatisticas>("/sms/estatisticas", { query: filtro }),
  });
  const envios = useQuery({
    queryKey: ["sms", "envios", filtro, situacao, page],
    queryFn: () =>
      apiFetch<{ data: SmsEnvioLinha[]; total: number; page: number; pageSize: number }>(
        "/sms/envios",
        {
          query: {
            ...filtro,
            ...(situacao !== "todas" ? { situacao } : {}),
            page,
            pageSize: 20,
          },
        },
      ),
  });

  const est = estatisticas.data;
  const totalPaginas = Math.max(1, Math.ceil((envios.data?.total ?? 0) / 20));
  // Cor presa ao motivo pela ordem do contrato (são seis, as seis da paleta):
  // filtrar o período não repinta os motivos.
  const ordemMotivos = Object.keys(SMS_MOTIVO_ROTULO) as SmsMotivo[];
  const porMotivo = [...(est?.porMotivo ?? [])]
    .sort((a, b) => b.total - a.total)
    .map((m) => ({
      id: m.motivo,
      nome: SMS_MOTIVO_ROTULO[m.motivo],
      valor: m.total,
      cor: `var(--viz-${(ordemMotivos.indexOf(m.motivo) % 6) + 1})`,
    }));
  const totalMotivos = porMotivo.reduce((a, m) => a + m.valor, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">SMS</h1>
        <p className="text-sm text-muted-foreground">
          Envios pela iAgente: saldo, retorno de entrega e respostas dos clientes.
        </p>
      </div>

      <SmsConfiguracaoCard />

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <FieldLabel>Ano</FieldLabel>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => { setAno((a) => a - 1); setPage(1); }}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-14 text-center font-medium tabular-nums">{ano}</span>
            <Button variant="outline" size="icon" onClick={() => { setAno((a) => a + 1); setPage(1); }}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <FieldLabel>Mês</FieldLabel>
          <Select value={mes} onValueChange={(v) => { setMes(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ano">Ano inteiro</SelectItem>
              {MESES.map((nome, i) => (
                <SelectItem key={nome} value={String(i + 1)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <FieldLabel>Motivo</FieldLabel>
          <Select value={motivo} onValueChange={(v) => { setMotivo(v); setPage(1); }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(Object.keys(SMS_MOTIVO_ROTULO) as SmsMotivo[]).map((m) => (
                <SelectItem key={m} value={m}>{SMS_MOTIVO_ROTULO[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <FieldLabel>Situação</FieldLabel>
          <Select value={situacao} onValueChange={(v) => { setSituacao(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {(Object.keys(SITUACAO_ROTULO) as SmsSituacao[]).map((s) => (
                <SelectItem key={s} value={s}>{SITUACAO_ROTULO[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Estatística */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Metrica rotulo="Enviados" valor={numero(est?.total)} />
        <Metrica
          rotulo="Entregues"
          valor={numero(est?.entregue)}
          detalhe={est?.total ? `${Math.round((est.entregue / est.total) * 100)}% do total` : undefined}
        />
        <Metrica rotulo="Falhas" valor={numero(est?.falha)} />
        <Metrica rotulo="Aguardando retorno" valor={numero(est?.aguardando)} />
        <Metrica rotulo="Respostas recebidas" valor={numero(est?.respostas)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Por motivo</p>
            {!porMotivo.length ? (
              <p className="text-sm text-muted-foreground">Nenhum envio no período.</p>
            ) : (
              <GraficoParticipacao
                itens={porMotivo}
                total={totalMotivos}
                forma="rosca"
                formato="quantidade"
                rotulo="Envios de SMS por motivo"
                rotuloTotal="Envios"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Envios em {ano}, mês a mês</p>
            <GraficoColunas
              itens={(est?.porMes ?? []).map((m) => ({
                rotulo: MESES[m.mes - 1].slice(0, 3),
                valor: m.total,
              }))}
              rotuloValor="Envios"
            />
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Histórico de envios</p>
          {envios.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !envios.data?.data.length ? (
            <p className="text-sm text-muted-foreground">Nenhum SMS no período.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente / celular</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Mensagem e respostas</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envios.data.data.map((e) => (
                    <TableRow key={e.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {dataHora(e.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.clienteId ? (
                          <Link href={`/comercial/posicao-cliente/${e.clienteId}`} className="font-medium hover:underline">
                            {e.clienteNome ?? "Cliente"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <p className="font-mono text-muted-foreground">{e.celular}</p>
                      </TableCell>
                      <TableCell className="text-xs">{SMS_MOTIVO_ROTULO[e.motivo]}</TableCell>
                      <TableCell className="max-w-md text-xs">
                        <p className="break-words">{e.mensagem}</p>
                        {e.respostas.map((r) => (
                          <p key={r.id} className="mt-1 flex gap-1 break-words rounded bg-muted px-2 py-1">
                            <MessageSquareReply className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                              {r.mensagem}
                              <span className="ml-1 text-muted-foreground">· {dataHora(r.recebidaEm)}</span>
                            </span>
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={SITUACAO_VARIANTE[e.situacao]}>{SITUACAO_ROTULO[e.situacao]}</Badge>
                        <p className="mt-1 text-muted-foreground">{e.erro ?? e.status}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {envios.data && envios.data.total > 20 && (
            <div className="flex items-center justify-end gap-2 text-xs">
              <span className="text-muted-foreground">
                Página {page} de {totalPaginas} · {numero(envios.data.total)} envios
              </span>
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
