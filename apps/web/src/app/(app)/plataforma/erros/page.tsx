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
import { Settings2, Trash2 } from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

const ORIGENS = [
  ["", "Todas"],
  ["servidor", "Servidor"],
  ["cliente", "Navegador"],
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
 * servidor: a requisição não recebeu resposta — foi por isso que a captura no
 * navegador entrou no escopo.
 */
function StatusBadge({ status }: { status: number | null }) {
  if (status === null) {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-600">
        sem resposta
      </Badge>
    );
  }
  return (
    <Badge variant={status >= 500 ? "destructive" : "outline"}>{status}</Badge>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <Card className="flex-1">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-xl font-semibold tabular-nums">{valor}</p>
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
  const { data, isLoading } = useQuery({
    queryKey: ["plataforma/erros/ocorrencias", grupo?.assinatura],
    queryFn: () =>
      apiFetch<{ data: ErroLog[] }>("/plataforma/erros/ocorrencias", {
        query: { assinatura: grupo!.assinatura, pageSize: 20 },
      }),
    enabled: !!grupo,
  });

  return (
    <Dialog open={!!grupo} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{grupo?.resumo}</DialogTitle>
          <DialogDescription>
            {grupo?.metodo ? `${grupo.metodo} ` : ""}
            {grupo?.rotaPadrao} — {grupo?.ocorrencias} ocorrência(s) em{" "}
            {grupo?.linhas} registro(s)
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}

        <div className="space-y-3">
          {data?.data.map((o) => (
            <div key={o.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatarDataHora(o.ultimaEm)}</span>
                {o.ocorrencias > 1 && (
                  <Badge variant="secondary">×{o.ocorrencias}</Badge>
                )}
                <StatusBadge status={o.status} />
                <span className="text-muted-foreground">{o.rota}</span>
              </div>

              <p className="mt-2">{o.mensagem}</p>

              <p className="mt-2 text-xs text-muted-foreground">
                {o.empresaRazaoSocial ?? "sem empresa"}
                {o.usuarioEmail ? ` · ${o.usuarioEmail}` : ""}
                {o.pagina ? ` · tela ${o.pagina}` : ""}
                {o.ip ? ` · ${o.ip}` : ""}
              </p>

              {o.stack && (
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {o.stack}
                </pre>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Governança do log. Fica recolhida: é ajuste raro, e o interruptor de 4xx
 * em especial é para ligar durante uma investigação e desligar depois.
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
    <Card>
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
            Erro de preenchimento entra junto. Ligue para investigar, desligue
            depois.
          </p>
        </div>

        <Button
          onClick={() => salvar.mutate(rascunho)}
          disabled={Object.keys(rascunho).length === 0 || salvar.isPending}
        >
          Salvar
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
      toast.success("Grupo removido. Se voltar a acontecer, aparece de novo.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const columns: ColumnDef<ErroLogGrupo>[] = [
    {
      header: "Última",
      className: "w-32",
      cell: (g) => (
        <span className="text-sm whitespace-nowrap">
          {formatarDataHora(g.ultimaEm)}
        </span>
      ),
    },
    {
      header: "Origem",
      className: "w-28",
      cell: (g) => (
        <Badge variant={g.origem === "cliente" ? "secondary" : "outline"}>
          {ERRO_ORIGEM_LABEL[g.origem]}
        </Badge>
      ),
    },
    {
      header: "Tipo",
      className: "w-32",
      cell: (g) => (
        <span className="text-sm text-muted-foreground">
          {ERRO_TIPO_LABEL[g.tipo]}
        </span>
      ),
    },
    { header: "Status", className: "w-28", cell: (g) => <StatusBadge status={g.status} /> },
    {
      header: "Rota",
      cell: (g) => (
        <span className="font-mono text-xs">
          {g.metodo ? `${g.metodo} ` : ""}
          {g.rotaPadrao}
        </span>
      ),
    },
    {
      header: "Mensagem",
      cell: (g) => <span className="text-sm">{g.resumo}</span>,
    },
    {
      header: "Vezes",
      className: "w-20 text-right",
      cell: (g) => (
        <span className="tabular-nums">{g.ocorrencias}</span>
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
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Erros</h1>
            <p className="text-sm text-muted-foreground">
              O que falhou, agrupado por rota e mensagem. Inclui o que o
              navegador viu e a API nunca soube — rede fora, resposta inválida,
              erro de JavaScript.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostrarConfig((v) => !v)}
          >
            <Settings2 className="size-4" />
            Governança
          </Button>
        </div>

        {mostrarConfig && <PainelConfig />}

        {resumo && (
          <div className="flex flex-wrap gap-3">
            <Cartao rotulo="Últimas 24h" valor={resumo.ultimas24h} />
            <Cartao rotulo="Últimos 7 dias" valor={resumo.ultimos7Dias} />
            <Cartao rotulo="Grupos distintos" valor={resumo.gruposDistintos} />
            <Cartao rotulo="Servidor" valor={resumo.doServidor} />
            <Cartao rotulo="Navegador" valor={resumo.doCliente} />
            <Cartao rotulo="Empresas afetadas" valor={resumo.empresasAfetadas} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <QuickFilterGroup>
            {ORIGENS.map(([valor, rotulo]) => (
              <QuickFilterButton
                key={valor || "todas"}
                active={origem === valor}
                onClick={() => {
                  setOrigem(valor);
                  setPage(1);
                }}
              >
                {rotulo}
              </QuickFilterButton>
            ))}
          </QuickFilterGroup>

          <Input
            placeholder="Buscar por rota ou mensagem"
            className="w-72"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(g) => g.assinatura}
          isLoading={isLoading}
          error={error}
          onRowClick={(g) => setAberto(g)}
          emptyMessage="Nenhum erro no período. Sem notícia é boa notícia."
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
