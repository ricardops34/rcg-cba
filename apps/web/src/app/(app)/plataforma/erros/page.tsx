"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ERRO_ORIGEM_LABEL,
  ERRO_TIPO_LABEL,
  type ErroLog,
  type ErroLogConfig,
  type ErroLogGrupo,
  type ErroLogResumo,
} from "@plataforma/contracts";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useResourceList } from "@/hooks/use-resource";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertOctagon,
  Settings2,
  Trash2,
  Clock,
  Calendar,
  Boxes,
  Server,
  Globe,
  Building2,
  Search,
  Copy,
  Check,
  Code2,
} from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

const ORIGENS = [
  ["", "Todas", Boxes],
  ["servidor", "Servidor", Server],
  ["cliente", "Navegador", Globe],
] as const;

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * O status como cor. `null` é o caso que importa e não existe em log de
 * servidor: a requisição não recebeu resposta.
 */
function StatusBadge({ status }: { status: number | null }) {
  if (status === null) {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
        sem resposta
      </Badge>
    );
  }
  return (
    <Badge variant={status >= 500 ? "destructive" : "outline"} className="font-mono">
      {status}
    </Badge>
  );
}

function Cartao({
  rotulo,
  valor,
  icon: Icon,
  colorClass,
}: {
  rotulo: string;
  valor: number | string;
  icon: any;
  colorClass?: string;
}) {
  return (
    <Card className="flex-1 min-w-36 shadow-xs border-border/60">
      <CardContent className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          <p className="text-xl font-bold tracking-tight mt-0.5 tabular-nums">{valor}</p>
        </div>
        <div className={`flex size-8 items-center justify-center rounded-lg ${colorClass || "bg-primary/10 text-primary"}`}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

/** As ocorrências de um grupo, com o stack. Abre ao clicar na linha. */
function DetalheGrupo({
  grupo,
  onClose,
}: {
  grupo: ErroLogGrupo | null;
  onClose: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["plataforma/erros/ocorrencias", grupo?.assinatura],
    queryFn: () =>
      apiFetch<{ data: ErroLog[] }>("/plataforma/erros/ocorrencias", {
        query: { assinatura: grupo!.assinatura, pageSize: 20 },
      }),
    enabled: !!grupo,
  });

  const copiarStack = (stack: string) => {
    navigator.clipboard.writeText(stack);
    setCopiado(true);
    toast.success("Stack trace copiado!");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={!!grupo} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertOctagon className="size-4 text-destructive" />
            {grupo?.resumo}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {grupo?.metodo ? `${grupo.metodo} ` : ""}
            {grupo?.rotaPadrao} — {grupo?.ocorrencias} ocorrência(s) em{" "}
            {grupo?.linhas} registro(s)
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando ocorrências…</p>
        )}

        <div className="space-y-3">
          {data?.data.map((o) => (
            <div key={o.id} className="rounded-lg border bg-card p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{formatarDataHora(o.ultimaEm)}</span>
                  {o.ocorrencias > 1 && (
                    <Badge variant="secondary" className="text-[10px]">×{o.ocorrencias}</Badge>
                  )}
                  <StatusBadge status={o.status} />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{o.rota}</span>
              </div>

              <p className="font-medium text-foreground">{o.mensagem}</p>

              <p className="text-xs text-muted-foreground">
                {o.empresaRazaoSocial ?? "sem empresa"}
                {o.usuarioEmail ? ` · ${o.usuarioEmail}` : ""}
                {o.pagina ? ` · tela ${o.pagina}` : ""}
                {o.ip ? ` · IP: ${o.ip}` : ""}
              </p>

              {o.stack && (
                <div className="relative group mt-2">
                  <div className="flex items-center justify-between rounded-t bg-muted/80 px-3 py-1 text-[11px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <Code2 className="size-3" /> Stack Trace
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => copiarStack(o.stack!)}
                    >
                      {copiado ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      {copiado ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-b bg-muted/40 p-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap border-t border-border/40">
                    {o.stack}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Governança do log. Fica recolhida: é ajuste raro.
 */
function PainelConfig() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["plataforma/erros/config"],
    queryFn: () => apiFetch<ErroLogConfig>("/plataforma/erros/config"),
  });

  const [rascunho, setRascunho] = useState<Partial<ErroLogConfig>>({});
  const valor = { ...data, ...rascunho } as ErroLogConfig;

  const salvar = useMutation({
    mutationFn: (input: Partial<ErroLogConfig>) =>
      apiFetch<ErroLogConfig>("/plataforma/erros/config", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      setRascunho({});
      void queryClient.invalidateQueries({ queryKey: ["plataforma/erros/config"] });
      toast.success("Governança do log atualizada.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (!data) return null;

  return (
    <Card className="shadow-xs border-border/60 bg-muted/30">
      <CardContent className="flex flex-wrap items-end gap-6 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="retencao">Retenção (dias)</Label>
          <Input
            id="retencao"
            type="number"
            min={0}
            className="w-28"
            value={valor.retencaoDias}
            onChange={(e) =>
              setRascunho((r) => ({ ...r, retencaoDias: Number(e.target.value) }))
            }
          />
          <p className="text-xs text-muted-foreground">0 = sem expurgo</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="teto">Teto por empresa</Label>
          <Input
            id="teto"
            type="number"
            min={0}
            className="w-32"
            value={valor.tetoPorEmpresa}
            onChange={(e) =>
              setRascunho((r) => ({
                ...r,
                tetoPorEmpresa: Number(e.target.value),
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            0 = sem teto; corta as mais antigas
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quatroxx">Registrar 4xx</Label>
          <div className="flex h-9 items-center">
            <Switch
              id="quatroxx"
              checked={valor.registrar4xx}
              onCheckedChange={(v) =>
                setRascunho((r) => ({ ...r, registrar4xx: v }))
              }
            />
          </div>
          <p className="max-w-64 text-xs text-muted-foreground">
            Erros de validação entram junto quando ativado.
          </p>
        </div>

        <Button
          onClick={() => salvar.mutate(rascunho)}
          disabled={Object.keys(rascunho).length === 0 || salvar.isPending}
          className="shadow-xs"
        >
          Salvar governança
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PlataformaErrosPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [origem, setOrigem] = useState("");
  const [search, setSearch] = useState("");
  const [aberto, setAberto] = useState<ErroLogGrupo | null>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  const queryClient = useQueryClient();
  const filtros = {
    page,
    pageSize,
    ...(origem ? { origem } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading, error } = useResourceList<ErroLogGrupo>(
    "plataforma/erros",
    filtros,
  );

  const { data: resumo } = useQuery({
    queryKey: ["plataforma/erros/resumo", origem, search],
    queryFn: () =>
      apiFetch<ErroLogResumo>("/plataforma/erros/resumo", {
        query: { ...(origem ? { origem } : {}), ...(search ? { search } : {}) },
      }),
  });

  const remover = useMutation({
    mutationFn: (assinatura: string) =>
      apiFetch(`/plataforma/erros/${assinatura}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plataforma/erros"] });
      toast.success("Grupo de erro removido.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const columns: ColumnDef<ErroLogGrupo>[] = [
    {
      header: "Última",
      className: "w-32",
      cell: (g) => (
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatarDataHora(g.ultimaEm)}
        </span>
      ),
    },
    {
      header: "Origem",
      className: "w-28",
      cell: (g) => (
        <Badge variant={g.origem === "cliente" ? "secondary" : "outline"} className="gap-1 text-[11px]">
          {g.origem === "cliente" ? <Globe className="size-3" /> : <Server className="size-3" />}
          {ERRO_ORIGEM_LABEL[g.origem]}
        </Badge>
      ),
    },
    {
      header: "Tipo",
      className: "w-32",
      cell: (g) => (
        <span className="text-xs text-muted-foreground font-mono">
          {ERRO_TIPO_LABEL[g.tipo]}
        </span>
      ),
    },
    { header: "Status", className: "w-28", cell: (g) => <StatusBadge status={g.status} /> },
    {
      header: "Rota",
      cell: (g) => (
        <span className="font-mono text-xs text-primary font-medium">
          {g.metodo ? `${g.metodo} ` : ""}
          {g.rotaPadrao}
        </span>
      ),
    },
    {
      header: "Mensagem",
      cell: (g) => <span className="text-xs font-medium text-foreground">{g.resumo}</span>,
    },
    {
      header: "Vezes",
      className: "w-20 text-right",
      cell: (g) => (
        <span className="tabular-nums font-bold text-xs">{g.ocorrencias}</span>
      ),
    },
    {
      header: "",
      id: "acoes",
      className: "w-12",
      cell: (g) => (
        <Button
          variant="ghost"
          size="icon"
          title="Apagar este grupo"
          onClick={(e) => {
            e.stopPropagation();
            remover.mutate(g.assinatura);
          }}
        >
          <Trash2 className="size-4 hover:text-destructive" />
        </Button>
      ),
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        {/* Superior Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive shadow-xs">
              <AlertOctagon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Erros e Exceções do Sistema</h1>
                <Badge variant="outline" className="text-xs">Error Tracking</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Captura e agrupamento automático de falhas do servidor, erros de navegação e exceções.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostrarConfig((v) => !v)}
            className="gap-2 shadow-xs"
          >
            <Settings2 className="size-4" />
            Governança de Logs
          </Button>
        </div>

        {mostrarConfig && <PainelConfig />}

        {resumo && (
          <div className="flex flex-wrap gap-3">
            <Cartao rotulo="Últimas 24h" valor={resumo.ultimas24h} icon={Clock} colorClass="bg-rose-500/10 text-rose-500" />
            <Cartao rotulo="Últimos 7 dias" valor={resumo.ultimos7Dias} icon={Calendar} colorClass="bg-amber-500/10 text-amber-500" />
            <Cartao rotulo="Grupos distintos" valor={resumo.gruposDistintos} icon={Boxes} colorClass="bg-primary/10 text-primary" />
            <Cartao rotulo="Servidor" valor={resumo.doServidor} icon={Server} colorClass="bg-blue-500/10 text-blue-500" />
            <Cartao rotulo="Navegador" valor={resumo.doCliente} icon={Globe} colorClass="bg-purple-500/10 text-purple-500" />
            <Cartao rotulo="Empresas Afetadas" valor={resumo.empresasAfetadas} icon={Building2} colorClass="bg-emerald-500/10 text-emerald-500" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <QuickFilterGroup>
            {ORIGENS.map(([valor, rotulo, Icone]) => (
              <QuickFilterButton
                key={valor || "todas"}
                active={origem === valor}
                onClick={() => {
                  setOrigem(valor);
                  setPage(1);
                }}
                className="gap-1.5"
              >
                <Icone className="size-3.5" />
                {rotulo}
              </QuickFilterButton>
            ))}
          </QuickFilterGroup>

          <div className="relative flex-1 min-w-64 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por rota ou mensagem..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(g) => g.assinatura}
          isLoading={isLoading}
          error={error}
          onRowClick={(g) => setAberto(g)}
          emptyMessage="Nenhum erro registrado no período."
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />

        <DetalheGrupo grupo={aberto} onClose={() => setAberto(null)} />
      </div>
    </PlataformaGuard>
  );
}

