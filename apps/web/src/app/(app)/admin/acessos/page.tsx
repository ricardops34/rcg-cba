"use client";
import { CrudHeader } from "@/components/crud/crud-header";
import { FiltersPopover } from "@/components/crud/filters-popover";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ACESSO_EVENTO_LABEL,
  type AcessoEvento,
  type AcessoLog,
  type AcessoResumo,
  type Sessao,
  type Usuario,
  type UsoRotina,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";

import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleCheck, Clock, LogIn, LogOut, ShieldAlert, TriangleAlert, Users } from "lucide-react";

/** Por que a sessão terminou (sessoes.motivoFim). */
const MOTIVO_FIM_LABEL: Record<string, string> = {
  fora_horario: "Fim do expediente",
  logout: "Saiu do sistema",
  novo_acesso: "Novo acesso em outro lugar",
  desconectado: "Desconectado pela administração",
};

/** Sessão do próprio token (`sid`), para não oferecer "Desconectar" nela. */
function sessaoDoToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

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

const EVENTOS_FALHA: AcessoEvento[] = [
  "login_falha",
  "login_bloqueado",
  "login_fora_horario",
  "acesso_fora_horario",
];

function EventoBadge({ evento }: { evento: AcessoEvento }) {
  const falha = EVENTOS_FALHA.includes(evento);
  const isSuccess = evento === "login_sucesso";
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium ${
        falha
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : isSuccess
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      {falha && <TriangleAlert className="mr-1 h-3 w-3 inline" />}
      {ACESSO_EVENTO_LABEL[evento]}
    </Badge>
  );
}

function CartaoKpi({
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
    <Card className="bg-card">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {titulo}
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${alerta ? "text-destructive" : ""}`}
          >
            {valor}
          </p>
          {detalhe && (
            <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
          )}
        </div>
        <div
          className={`rounded-full p-3 ${
            alerta
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          <Icone className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AcessosPage() {
  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(() => dateToInput(new Date()));
  const [usuarioId, setUsuarioId] = useState<string>("todos");
  const [evento, setEvento] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageSessoes, setPageSessoes] = useState(1);
  const [ordemEventos, setOrdemEventos] = useState<{
    sortBy?: string;
    sortOrder: "asc" | "desc";
  }>({ sortOrder: "desc" });
  const [ordemSessoes, setOrdemSessoes] = useState<{
    sortBy?: string;
    sortOrder: "asc" | "desc";
  }>({ sortOrder: "desc" });

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
      apiFetch<Pagina<Usuario>>("/usuarios", {
        query: { pageSize: 100, sortBy: "nome" },
      }),
  });

  const resumoQuery = useQuery({
    queryKey: ["acessos", "resumo", filtros],
    queryFn: () =>
      apiFetch<AcessoResumo>("/acessos/resumo", { query: filtros }),
  });

  const eventosQuery = useQuery({
    queryKey: ["acessos", "eventos", filtros, page, pageSize, ordemEventos],
    queryFn: () =>
      apiFetch<Pagina<AcessoLog>>("/acessos", {
        query: { ...filtros, ...ordemEventos, page, pageSize },
      }),
  });

  const sessoesQuery = useQuery({
    queryKey: [
      "acessos",
      "sessoes",
      filtros,
      pageSessoes,
      pageSize,
      ordemSessoes,
    ],
    queryFn: () =>
      apiFetch<Pagina<Sessao>>("/acessos/sessoes", {
        query: { ...filtros, ...ordemSessoes, page: pageSessoes, pageSize },
      }),
  });

  // Telas mais abertas no período (mesmos filtros de período e usuário).
  const usoQuery = useQuery({
    queryKey: ["acessos", "uso-rotinas", filtros],
    queryFn: () => apiFetch<{ data: UsoRotina[] }>("/acessos/uso-rotinas", { query: filtros }),
  });
  const maiorUso = Math.max(1, ...(usoQuery.data?.data ?? []).map((r) => r.acessos));

  const colunasRotinas: ColumnDef<UsoRotina>[] = [
    {
      header: "Rotina",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.rotinaNome}</p>
          <p className="truncate text-xs text-muted-foreground">{r.moduloNome ?? "—"}</p>
        </div>
      ),
    },
    {
      header: "Acessos",
      className: "w-64",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.round((r.acessos / maiorUso) * 100)}%` }}
            />
          </div>
          <span className="w-12 text-right text-xs font-medium">{r.acessos.toLocaleString("pt-BR")}</span>
        </div>
      ),
    },
    {
      header: "Usuários",
      className: "text-right",
      cell: (r) => <span className="text-xs">{r.usuarios}</span>,
    },
    {
      header: "Último acesso",
      cell: (r) => <span className="text-xs font-mono">{dataHoraBr(r.ultimoAcessoEm)}</span>,
    },
  ];

  const resumo = resumoQuery.data;

  const recarregar = () => {
    void resumoQuery.refetch();
    void eventosQuery.refetch();
    void sessoesQuery.refetch();
    void usoQuery.refetch();
  };

  // Desconectar exige acessos.editar (a API confere de novo). A sessão atual de
  // quem está na tela não recebe o botão: para ela existe o "Sair".
  const podeDesconectar = useAuthStore((st) => st.hasPermission("acessos", "editar"));
  const sessaoAtual = useAuthStore((st) => sessaoDoToken(st.accessToken));
  const [desconectando, setDesconectando] = useState<string | null>(null);
  const desconectar = async (s: Sessao) => {
    if (!window.confirm(`Desconectar ${s.usuarioNome}? A pessoa sai do sistema e precisa entrar de novo.`)) {
      return;
    }
    setDesconectando(s.id);
    try {
      await apiFetch(`/acessos/sessoes/${s.id}/desconectar`, { method: "POST" });
      toast.success(`${s.usuarioNome} foi desconectado`);
      recarregar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível desconectar");
    } finally {
      setDesconectando(null);
    }
  };

  const colunasEventos: ColumnDef<AcessoLog>[] = [
    {
      header: "Quando",
      sortKey: "criadoEm",
      cell: (l) => (
        <span className="text-xs font-mono">{dataHoraBr(l.criadoEm)}</span>
      ),
    },
    {
      header: "Usuário",
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{l.usuarioNome ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{l.email}</p>
        </div>
      ),
    },
    { header: "Evento", cell: (l) => <EventoBadge evento={l.evento} /> },
    {
      header: "Detalhe",
      cell: (l) => (
        <span className="text-xs text-muted-foreground">
          {l.detalhe ?? "—"}
        </span>
      ),
    },
    {
      header: "IP",
      cell: (l) => <code className="text-xs font-mono">{l.ip ?? "—"}</code>,
    },
    {
      header: "Dispositivo",
      cell: (l) =>
        l.userAgent ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">
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
          <p className="truncate text-sm font-medium">{s.usuarioNome}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    {
      header: "Entrada",
      sortKey: "iniciadaEm",
      cell: (s) => (
        <span className="text-xs font-mono">{dataHoraBr(s.iniciadaEm)}</span>
      ),
    },
    {
      header: "Saída",
      cell: (s) =>
        s.encerradaEm ? (
          <span className="text-xs font-mono">{dataHoraBr(s.encerradaEm)}</span>
        ) : s.ativa ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
          >
            <CircleCheck className="mr-1 h-3 w-3 inline" /> Em uso
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            Sem registro (última ativ: {dataHoraBr(s.ultimaAtividadeEm)})
          </span>
        ),
    },
    {
      header: "Tempo de uso",
      cell: (s) => (
        <span className="text-xs font-medium">{duracao(s.duracaoMinutos)}</span>
      ),
    },
    {
      header: "Motivo do fim",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {(s.motivoFim && MOTIVO_FIM_LABEL[s.motivoFim]) ?? s.motivoFim ?? "—"}
        </span>
      ),
    },
    {
      header: "IP",
      cell: (s) => <code className="text-xs font-mono">{s.ip ?? "—"}</code>,
    },
    ...(podeDesconectar
      ? [
          {
            header: "",
            className: "w-32 text-right",
            cell: (s: Sessao) =>
              !s.encerradaEm && s.id !== sessaoAtual ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive"
                  disabled={desconectando === s.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void desconectar(s);
                  }}
                >
                  <LogOut className="size-3.5" />
                  {desconectando === s.id ? "Desconectando…" : "Desconectar"}
                </Button>
              ) : null,
          } satisfies ColumnDef<Sessao>,
        ]
      : []),
  ];

  const colunasUsuarios: ColumnDef<AcessoResumo["porUsuario"][number]>[] = [
    {
      header: "Usuário",
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{u.usuarioNome}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      ),
    },
    {
      header: "Sessões",
      cell: (u) => <Badge variant="secondary">{u.sessoes}</Badge>,
    },
    {
      header: "Tempo total",
      cell: (u) => (
        <span className="text-xs font-semibold">{duracao(u.minutosTotal)}</span>
      ),
    },
    {
      header: "Média por sessão",
      cell: (u) => (
        <span className="text-xs text-muted-foreground">
          {duracao(u.minutosMedio)}
        </span>
      ),
    },
    {
      header: "Último acesso",
      cell: (u) => (
        <span className="text-xs font-mono">{dataHoraBr(u.ultimoAcesso)}</span>
      ),
    },
    {
      header: "Tentativas sem sucesso",
      cell: (u) =>
        u.tentativasFalha > 0 ? (
          <Badge variant="destructive" className="text-xs">
            {u.tentativasFalha}
          </Badge>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Auditoria de Acessos
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o histórico de login, sessões ativas e tentativas de
            acesso dos usuários.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CartaoKpi
          icone={LogIn}
          titulo="Entradas no período"
          valor={String(resumo?.loginsSucesso ?? 0)}
        />
        <CartaoKpi
          icone={ShieldAlert}
          titulo="Tentativas s/ sucesso"
          valor={String(resumo?.tentativasFalha ?? 0)}
          alerta={(resumo?.tentativasFalha ?? 0) > 0}
        />
        <CartaoKpi
          icone={Users}
          titulo="Usuários ativos"
          valor={String(resumo?.usuariosDistintos ?? 0)}
        />
        <CartaoKpi
          icone={Clock}
          titulo="Tempo total de uso"
          valor={duracao(resumo?.minutosTotal ?? 0)}
          detalhe={`Média ${duracao(resumo?.minutosMedioPorSessao ?? 0)}/sessão`}
        />
        <CartaoKpi
          icone={CircleCheck}
          titulo="Sessões abertas"
          valor={String(resumo?.sessoesAbertas ?? 0)}
        />
      </div>

      {/* Filtros */}
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="E-mail, IP ou Nome"
        onRefresh={recarregar}
        isRefreshing={
          eventosQuery.isFetching ||
          sessoesQuery.isFetching ||
          resumoQuery.isFetching
        }
        actions={
          <FiltersPopover
            active={
              usuarioId !== "todos" ||
              evento !== "todos" ||
              dataInicio !== inicioPadrao() ||
              dataFim !== dateToInput(new Date())
            }
            onClear={() => {
              setUsuarioId("todos");
              setEvento("todos");
              setDataInicio(inicioPadrao());
              setDataFim(dateToInput(new Date()));
              setPage(1);
              setPageSessoes(1);
            }}
          >
            <Field>
              <FieldLabel htmlFor="dataInicio">Data Início</FieldLabel>
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
              <FieldLabel htmlFor="dataFim">Data Fim</FieldLabel>
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
                  <SelectItem value="todos">Todos os usuários</SelectItem>
                  {(usuariosQuery.data?.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="evento">Tipo de Evento</FieldLabel>
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
                  <SelectItem value="todos">Todos os eventos</SelectItem>
                  {(Object.keys(ACESSO_EVENTO_LABEL) as AcessoEvento[]).map(
                    (e) => (
                      <SelectItem key={e} value={e}>
                        {ACESSO_EVENTO_LABEL[e]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
          </FiltersPopover>
        }
      />

      {/* Tabela por Abas */}
      <Tabs defaultValue="eventos" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="eventos">Eventos Rastreados</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões de Uso</TabsTrigger>
          <TabsTrigger value="usuarios">Tempo por Usuário</TabsTrigger>
          <TabsTrigger value="rotinas">Uso por Rotina</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="pt-4">
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
            onSortChange={(sortBy, sortOrder) =>
              setOrdemEventos({ sortBy, sortOrder })
            }
            storageKey="acessos-eventos"
            emptyMessage="Nenhum evento de acesso registrado no período selecionado."
          />
        </TabsContent>

        <TabsContent value="sessoes" className="pt-4">
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
            onSortChange={(sortBy, sortOrder) =>
              setOrdemSessoes({ sortBy, sortOrder })
            }
            storageKey="acessos-sessoes"
            emptyMessage="Nenhuma sessão registrada no período selecionado."
          />
        </TabsContent>

        <TabsContent value="usuarios" className="pt-4">
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
            emptyMessage="Nenhum dado de usuário registrado no período selecionado."
          />
        </TabsContent>

        <TabsContent value="rotinas" className="pt-4">
          <EntityTable
            columns={colunasRotinas}
            rows={usoQuery.data?.data ?? []}
            rowKey={(r) => r.rotinaId}
            isLoading={usoQuery.isLoading}
            error={usoQuery.error}
            page={1}
            pageSize={usoQuery.data?.data.length || 1}
            total={usoQuery.data?.data.length ?? 0}
            totalPages={1}
            onPageChange={() => undefined}
            onPageSizeChange={() => undefined}
            emptyMessage="Nenhuma tela aberta no período selecionado. O registro começou em 30/09/2026."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
