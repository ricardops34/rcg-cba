"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  integracaoApiKeyCreateSchema,
  type IntegracaoApiKey,
  type IntegracaoApiKeyCreate,
  type IntegracaoApiKeyCriada,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy,
  Check,
  KeyRound,
  MoreHorizontal,
  ShieldOff,
  ShieldCheck,
  Trash2,
  Plug,
  Activity,
  ShieldAlert,
  Plus,
  BookOpen,
  Upload,
  Download,
  FileText,
  AlertCircle,
} from "lucide-react";

const dataBr = (v: string | null) => {
  if (!v) return "Nunca";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

const dataHoraBr = (v: string | null) => {
  if (!v) return "Nunca usada";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

export default function IntegracaoPage() {
  const [novaChaveAberta, setNovaChaveAberta] = useState(false);
  const [importDialogAberta, setImportDialogAberta] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<IntegracaoApiKey>(
    "integracao-keys",
    { search, page, pageSize, sortBy: "createdAt", sortOrder: "desc" },
  );
  const { update, remove } = useResourceMutations<never, { ativo: boolean }>("integracao-keys");

  const rows = data?.data ?? [];
  const ativasCount = rows.filter((r) => r.ativo).length;
  const revogadasCount = rows.filter((r) => !r.ativo).length;

  const onToggleAtivo = async (chave: IntegracaoApiKey) => {
    try {
      await update.mutateAsync({ id: chave.id, input: { ativo: !chave.ativo } });
      toast.success(chave.ativo ? "Chave revogada" : "Chave reativada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao atualizar chave");
    }
  };

  const onDelete = async (chave: IntegracaoApiKey) => {
    if (!confirm(`Excluir a chave "${chave.nome}"? Isso não pode ser desfeito.`)) return;
    try {
      await remove.mutateAsync(chave.id);
      toast.success("Chave excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir chave");
    }
  };

  const columns: ColumnDef<IntegracaoApiKey>[] = [
    {
      header: "Identificação da Chave",
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
            <KeyRound className="size-4 text-primary" />
          </div>
          <div>
            <p className="font-medium leading-tight">{c.nome}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.prefixo}…</p>
          </div>
        </div>
      ),
    },
    {
      header: "Status",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <StatusDot active={c.ativo} />
          <span className="text-xs font-medium">
            {c.ativo ? "Ativa" : "Revogada"}
          </span>
        </div>
      ),
    },
    {
      header: "Expira em",
      cell: (c) => (
        <span className="text-xs text-muted-foreground">{dataBr(c.expiraEm)}</span>
      ),
    },
    {
      header: "Último uso",
      cell: (c) => (
        <span className="text-xs text-muted-foreground">{dataHoraBr(c.ultimoUso)}</span>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onToggleAtivo(c)}>
              {c.ativo ? (
                <>
                  <ShieldOff className="size-4 text-amber-500" /> Revogar acesso
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4 text-emerald-500" /> Reativar chave
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
              <Trash2 className="size-4" /> Excluir permanentemente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página no padrão do sistema */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integração ERP (API Keys)</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as credenciais de API para sincronização automática de dados com sistemas ERP parceiros.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportDialogAberta(true)}
          >
            <Upload className="size-4" />
            Importar TXT Protheus
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open("/api/docs", "_blank")}
          >
            <BookOpen className="size-4" />
            Swagger / Docs API
          </Button>
          <Button type="button" size="sm" onClick={() => setNovaChaveAberta(true)}>
            <Plus className="size-4" />
            Nova chave
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/70 shadow-xs">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Plug className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de Chaves</p>
              <p className="text-xl font-bold">{data?.total ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-xs">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Activity className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Chaves Ativas</p>
              <p className="text-xl font-bold">{ativasCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-xs">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Revogadas / Inativas</p>
              <p className="text-xl font-bold">{revogadasCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {/* Tabela de Chaves */}
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        error={error}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        emptyMessage="Nenhuma chave de integração cadastrada."
      />

      {novaChaveAberta && (
        <NovaChaveDialog onClose={() => setNovaChaveAberta(false)} />
      )}

      {importDialogAberta && (
        <ImportTxtDialog
          chaves={rows.filter((r) => r.ativo)}
          onClose={() => setImportDialogAberta(false)}
        />
      )}
    </div>
  );
}

function NovaChaveDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [criada, setCriada] = useState<IntegracaoApiKeyCriada | null>(null);
  const [copiado, setCopiado] = useState(false);

  const form = useForm<IntegracaoApiKeyCreate>({
    resolver: zodResolver(integracaoApiKeyCreateSchema),
    defaultValues: { nome: "", expiraEm: null },
  });

  const criar = useMutation({
    mutationFn: (input: IntegracaoApiKeyCreate) =>
      apiFetch<IntegracaoApiKeyCriada>("/integracao-keys", {
        method: "POST",
        body: input,
      }),
    onSuccess: (resultado) => {
      setCriada(resultado);
      queryClient.invalidateQueries({ queryKey: ["integracao-keys", "list"] });
    },
  });

  const onSubmit = async (values: IntegracaoApiKeyCreate) => {
    try {
      await criar.mutateAsync(values);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao criar chave",
      );
    }
  };

  const copiar = async () => {
    if (!criada) return;
    await navigator.clipboard.writeText(criada.chave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {criada ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-emerald-500" />
                Chave Gerada com Sucesso
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <strong>Atenção:</strong> Copie esta chave de API agora. Ela é exibida uma única vez e não poderá ser recuperada posteriormente.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border bg-muted p-2.5 font-mono text-xs font-semibold">
                  {criada.chave}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copiar}
                >
                  {copiado ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Entendido, Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Gerar Nova Chave de API</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4 space-y-4">
              <Field data-invalid={!!form.formState.errors.nome}>
                <FieldLabel htmlFor="nome">Nome da Integração / Sistema</FieldLabel>
                <Input
                  id="nome"
                  placeholder="Ex.: ERP Protheus - Produção"
                  {...form.register("nome")}
                />
                <FieldError errors={[form.formState.errors.nome]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="expiraEm">Data de Expiração (Opcional)</FieldLabel>
                <Input
                  id="expiraEm"
                  type="date"
                  onChange={(e) =>
                    form.setValue(
                      "expiraEm",
                      e.target.value
                        ? new Date(`${e.target.value}T00:00:00`)
                        : null,
                    )
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={form.formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Gerar Chave
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ResultadoImportacao {
  total: number;
  processados: number;
  criados: number;
  atualizados: number;
  excluidos: number;
  erros: Array<{ linha: number; chave?: string; mensagem: string }>;
}

function ImportTxtDialog({
  chaves,
  onClose,
}: {
  chaves: IntegracaoApiKey[];
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState(chaves[0]?.prefixo ? "" : "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [chaveSelecionada, setChaveSelecionada] = useState<string>("");

  const handleImportar = async () => {
    if (!arquivo) {
      toast.error("Selecione um arquivo TXT para importar");
      return;
    }
    if (!chaveSelecionada) {
      toast.error("Informe a chave de API para a importação");
      return;
    }

    try {
      setCarregando(true);
      const conteudo = await arquivo.text();

      const res = await fetch("/api/v1/integracao/arquivo/importar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": chaveSelecionada,
        },
        body: JSON.stringify({ conteudo }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar arquivo");
      }

      const data: ResultadoImportacao = await res.json();
      setResultado(data);
      toast.success("Importação concluída");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na importação");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-primary" />
            Importar Arquivo TXT do Protheus
          </DialogTitle>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
              <h4 className="font-semibold text-emerald-600 dark:text-emerald-400">
                Resumo do Processamento
              </h4>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <p>Total de Linhas: <span className="font-semibold">{resultado.total}</span></p>
                <p>Processados: <span className="font-semibold">{resultado.processados}</span></p>
                <p>Criados: <span className="font-semibold text-emerald-600">{resultado.criados}</span></p>
                <p>Atualizados: <span className="font-semibold text-blue-600">{resultado.atualizados}</span></p>
                <p>Excluídos: <span className="font-semibold text-amber-600">{resultado.excluidos}</span></p>
                <p>Erros: <span className="font-semibold text-rose-600">{resultado.erros.length}</span></p>
              </div>
            </div>

            {resultado.erros.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 text-xs border rounded-md p-2 bg-muted/40">
                <p className="font-semibold text-rose-600">Detalhes dos Erros:</p>
                {resultado.erros.map((e, idx) => (
                  <p key={idx} className="text-muted-foreground font-mono">
                    Linha {e.linha} {e.chave ? `(${e.chave})` : ""}: {e.mensagem}
                  </p>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={onClose}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="keyInput">Chave de API (x-api-key)</FieldLabel>
              <Input
                id="keyInput"
                placeholder="Cole aqui a chave de API (itg_...)"
                value={chaveSelecionada}
                onChange={(e) => setChaveSelecionada(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                A chave de API identifica a empresa de destino dos dados.
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="fileInput">Arquivo TXT / JSON</FieldLabel>
              <Input
                id="fileInput"
                type="file"
                accept=".txt,.json"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </Field>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onClose} disabled={carregando}>
                Cancelar
              </Button>
              <Button onClick={handleImportar} disabled={carregando || !arquivo || !chaveSelecionada}>
                {carregando ? "Processando..." : "Importar Arquivo"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

