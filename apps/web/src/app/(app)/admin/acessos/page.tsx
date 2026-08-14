"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ACESSO_EVENTO_LABEL,
  type AcessoEvento,
  type AcessoLog,
  type AcessoResumo,
  type Sessao,
  type Usuario,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CircleCheck,
  Clock,
  LogIn,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react";

/** Página de resposta das rotas paginadas de /acessos. */
interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const dataHoraBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

/** Minutos → "3h 12min", que é como se lê tempo de uso. */
function duracao(minutos: number) {
  if (!minutos || minutos < 1) return "menos de 1 min";
  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  if (!horas) return `${resto} min`;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

const dateToInput = (d: Date) => d.toISOString().slice(0, 10);
const inicioPadrao = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return dateToInput(d);
};

/** Eventos que representam acesso negado — pintados em vermelho na listagem. */
const EVENTOS_FALHA: AcessoEvento[] = [
  "login_falha",
  "login_bloqueado",
  "login_fora_horario",
  "acesso_fora_horario",
];

function EventoBadge({ evento }: { evento: AcessoEvento }) {
  const falha = EVENTOS_FALHA.includes(evento);
  const classe = falha
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : evento === "login_sucesso"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-border/70 bg-muted/40 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${classe}`}>
      {falha && <TriangleAlert className="size-3" />}
      {ACESSO_EVENTO_LABEL[evento]}
    </span>
  );
}

function Cartao({
  icone: Icone,
  titulo,
  valor,
  detalhe,
  alerta,
}: {
  icone: typeof LogIn;
  titulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <span
          className={`rounded-md border p-2 ${
            alerta
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border/70 bg-muted/40 text-muted-foreground"
          }`}
        >
          <Icone className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <p className="text-lg font-semibold tracking-tight">{valor}</p>
          {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Administração > Acessos: quem entrou, quanto tempo ficou e quem tentou sem
 * conseguir. Os dados vêm do rastro gravado pelo próprio fluxo de
 * autenticação (ver AcessosService na API) — esta tela é só leitura.
 */
export default function AcessosPage() {
  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(() => dateToInput(new Date()));
  const [usuarioId, setUsuarioId] = useState<string>("todos");
  const [evento, setEvento] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageSessoes, setPageSessoes] = useState(1);
  // Sem sortBy escolhido, a API já devolve do mais recente para o mais antigo.
  const [ordemEventos, setOrdemEventos] = useState<{
    sortBy?: string;
    sortOrder: "asc" | "desc";
  }>({ sortOrder: "desc" });
  const [ordemSessoes, setOrdemSessoes] = useState<{
    sortBy?: string;
    sortOrder: "asc" | "desc";
  }>({ sortOrder: "desc" });

  // dataFim entra como o fim do dia: sem isso, escolher "hoje" cortaria tudo
  // o que aconteceu depois da meia-noite.
  const filtros = {
    dataInicio: `${dataInicio}T00:00:00`,
    dataFim: `${dataFim}T23:59:59`,
    ...(usuarioId !== "todos" ? { usuarioId } : {}),
    ...(evento !== "todos" ? { evento } : {}),
    ...(search ? { search } : {}),
  };

  const usuariosQuery = useQuery({
    queryKey: ["usuarios", "select"],
    queryFn: () =>
      apiFetch<Pagina<Usuario>>("/usuarios", { query: { pageSize: 100, sortBy: "nome" } }),
  });

  const resumoQuery = useQuery({
    queryKey: ["acessos", "resumo", filtros],
    queryFn: () => apiFetch<AcessoResumo>("/acessos/resumo", { query: filtros }),
  });

  const eventosQuery = useQuery({
    queryKey: ["acessos", "eventos", filtros, page, pageSize, ordemEventos],
    queryFn: () =>
      apiFetch<Pagina<AcessoLog>>("/acessos", {
        query: { ...filtros, ...ordemEventos, page, pageSize },
      }),
  });

  const sessoesQuery = useQuery({
    queryKey: ["acessos", "sessoes", filtros, pageSessoes, pageSize, ordemSessoes],
    queryFn: () =>
      apiFetch<Pagina<Sessao>>("/acessos/sessoes", {
        query: { ...filtros, ...ordemSessoes, page: pageSessoes, pageSize },
      }),
  });

  const resumo = resumoQuery.data;

  const recarregar = () => {
    void resumoQuery.refetch();
    void eventosQuery.refetch();
    void sessoesQuery.refetch();
  };

  const colunasEventos: ColumnDef<AcessoLog>[] = [
    { header: "Quando", sortKey: "criadoEm", cell: (l) => dataHoraBr(l.criadoEm) },
    {
      header: "Usuário",
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{l.usuarioNome ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{l.email}</p>
        </div>
      ),
    },
    { header: "Evento", cell: (l) => <EventoBadge evento={l.evento} /> },
    {
      header: "Detalhe",
      cell: (l) => <span className="text-xs text-muted-foreground">{l.detalhe ?? "—"}</span>,
    },
    { header: "IP", cell: (l) => <code className="text-xs">{l.ip ?? "—"}</code> },
    {
      header: "Dispositivo",
      cell: (l) =>
        l.userAgent ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[18rem] truncate text-xs text-muted-foreground">
                {l.userAgent}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{l.userAgent}</TooltipContent>
          </Tooltip>
        ) : (
          "—"
        ),
    },
  ];

  const colunasSessoes: ColumnDef<Sessao>[] = [
    {
      header: "Usuário",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.usuarioNome}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    { header: "Entrada", sortKey: "iniciadaEm", cell: (s) => dataHoraBr(s.iniciadaEm) },
    {
      header: "Saída",
      cell: (s) =>
        s.encerradaEm ? (
          dataHoraBr(s.encerradaEm)
        ) : s.ativa ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-3.5" /> Em uso
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            sem saída registrada (última atividade {dataHoraBr(s.ultimaAtividadeEm)})
          </span>
        ),
    },
    { header: "Tempo de uso", cell: (s) => duracao(s.duracaoMinutos) },
    {
      header: "Motivo do fim",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {s.motivoFim === "fora_horario"
            ? "Fim do expediente"
            : s.motivoFim === "logout"
              ? "Saiu do sistema"
              : (s.motivoFim ?? "—")}
        </span>
      ),
    },
    { header: "IP", cell: (s) => <code className="text-xs">{s.ip ?? "—"}</code> },
  ];

  const colunasUsuarios: ColumnDef<AcessoResumo["porUsuario"][number]>[] = [
    {
      header: "Usuário",
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{u.usuarioNome}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      ),
    },
    { header: "Sessões", cell: (u) => u.sessoes },
    { header: "Tempo total", cell: (u) => duracao(u.minutosTotal) },
    { header: "Média por sessão", cell: (u) => duracao(u.minutosMedio) },
    { header: "Último acesso", cell: (u) => dataHoraBr(u.ultimoAcesso) },
    {
      header: "Tentativas sem sucesso",
      cell: (u) =>
        u.tentativasFalha > 0 ? (
          <span className="text-destructive">{u.tentativasFalha}</span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Acessos</h1>
        <p className="text-sm text-muted-foreground">
          Entradas, tempo de uso e tentativas sem sucesso dos usuários desta empresa. O horário
          de trabalho que limita o acesso é definido no cadastro de cada usuário.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field>
            <FieldLabel htmlFor="dataInicio">De</FieldLabel>
            <Input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dataFim">Até</FieldLabel>
            <Input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="usuarioId">Usuário</FieldLabel>
            <Select
              value={usuarioId}
              onValueChange={(v) => {
                setUsuarioId(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="usuarioId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(usuariosQuery.data?.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="evento">Evento</FieldLabel>
            <Select
              value={evento}
              onValueChange={(v) => {
                setEvento(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="evento" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(Object.keys(ACESSO_EVENTO_LABEL) as AcessoEvento[]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {ACESSO_EVENTO_LABEL[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="search">Buscar (e-mail, IP, nome)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="search"
                value={search}
                placeholder="maria@… ou 189.45…"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={recarregar}>
                <RefreshCw
                  className={`size-4 ${eventosQuery.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Cartao icone={LogIn} titulo="Entradas no período" valor={String(resumo?.loginsSucesso ?? 0)} />
        <Cartao
          icone={ShieldAlert}
          titulo="Tentativas sem sucesso"
          valor={String(resumo?.tentativasFalha ?? 0)}
          alerta={(resumo?.tentativasFalha ?? 0) > 0}
        />
        <Cartao icone={Users} titulo="Usuários que acessaram" valor={String(resumo?.usuariosDistintos ?? 0)} />
        <Cartao
          icone={Clock}
          titulo="Tempo total de uso"
          valor={duracao(resumo?.minutosTotal ?? 0)}
          detalhe={`Média de ${duracao(resumo?.minutosMedioPorSessao ?? 0)} por sessão`}
        />
        <Cartao
          icone={CircleCheck}
          titulo="Sessões em uso agora"
          valor={String(resumo?.sessoesAbertas ?? 0)}
        />
      </div>

      <Tabs defaultValue="eventos">
        <TabsList>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          <TabsTrigger value="usuarios">Tempo por usuário</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="pt-3">
          <EntityTable
            columns={colunasEventos}
            rows={eventosQuery.data?.data ?? []}
            rowKey={(l) => l.id}
            isLoading={eventosQuery.isLoading}
            error={eventosQuery.error}
            page={eventosQuery.data?.page ?? page}
            pageSize={eventosQuery.data?.pageSize ?? pageSize}
            total={eventosQuery.data?.total ?? 0}
            totalPages={eventosQuery.data?.totalPages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            sortBy={ordemEventos.sortBy}
            sortOrder={ordemEventos.sortOrder}
            onSortChange={(sortBy, sortOrder) => setOrdemEventos({ sortBy, sortOrder })}
            storageKey="acessos-eventos"
            emptyMessage="Nenhum acesso registrado no período."
          />
        </TabsContent>

        <TabsContent value="sessoes" className="pt-3">
          <EntityTable
            columns={colunasSessoes}
            rows={sessoesQuery.data?.data ?? []}
            rowKey={(s) => s.id}
            isLoading={sessoesQuery.isLoading}
            error={sessoesQuery.error}
            page={sessoesQuery.data?.page ?? pageSessoes}
            pageSize={sessoesQuery.data?.pageSize ?? pageSize}
            total={sessoesQuery.data?.total ?? 0}
            totalPages={sessoesQuery.data?.totalPages ?? 1}
            onPageChange={setPageSessoes}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPageSessoes(1);
            }}
            sortBy={ordemSessoes.sortBy}
            sortOrder={ordemSessoes.sortOrder}
            onSortChange={(sortBy, sortOrder) => setOrdemSessoes({ sortBy, sortOrder })}
            storageKey="acessos-sessoes"
            emptyMessage="Nenhuma sessão no período."
          />
        </TabsContent>

        <TabsContent value="usuarios" className="pt-3">
          {/* Ranking já vem inteiro no resumo (é uma linha por usuário da
              empresa), então esta aba não pagina no servidor. */}
          <EntityTable
            columns={colunasUsuarios}
            rows={resumo?.porUsuario ?? []}
            rowKey={(u) => u.usuarioId}
            isLoading={resumoQuery.isLoading}
            error={resumoQuery.error}
            page={1}
            pageSize={resumo?.porUsuario.length || 1}
            total={resumo?.porUsuario.length ?? 0}
            totalPages={1}
            onPageChange={() => undefined}
            onPageSizeChange={() => undefined}
            emptyMessage="Nenhum acesso no período."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
