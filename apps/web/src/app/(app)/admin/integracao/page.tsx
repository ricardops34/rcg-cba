"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  integracaoApiKeyCreateSchema,
  type IntegracaoApiKey,
  type IntegracaoApiKeyCreate,
  type IntegracaoApiKeyCriada,
  type IntegracaoEndpointItem,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Server,
  Radio,
  Search,
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
  const [abaAtiva, setAbaAtiva] = useState<"chaves" | "monitor">("chaves");
  const [novaChaveAberta, setNovaChaveAberta] = useState(false);
  const [importDialogAberta, setImportDialogAberta] = useState(false);
  const [search, setSearch] = useState("");
  const [endpointSearch, setEndpointSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const queryClient = useQueryClient();

  // 1. Chaves de API
  const { data, isLoading, isFetching, refetch, error } = useResourceList<IntegracaoApiKey>(
    "integracao-keys",
    { search, page, pageSize, sortBy: "createdAt", sortOrder: "desc" },
  );
  const { update, remove } = useResourceMutations<never, { ativo: boolean }>("integracao-keys");

  const rows = data?.data ?? [];
  const ativasCount = rows.filter((r) => r.ativo).length;
  const revogadasCount = rows.filter((r) => !r.ativo).length;

  // 2. Monitor de Endpoints
  const endpointsQuery = useQuery<IntegracaoEndpointItem[]>({
    queryKey: ["integracao-endpoints"],
    queryFn: () => apiFetch<IntegracaoEndpointItem[]>("/integracao-keys/endpoints"),
  });

  const toggleEndpointMutation = useMutation({
    mutationFn: ({ endpointKey, ativo }: { endpointKey: string; ativo: boolean }) =>
      apiFetch(`/integracao-keys/endpoints/${endpointKey}`, {
        method: "PATCH",
        body: { ativo },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integracao-endpoints"] });
    },
  });

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

  const onToggleEndpointStatus = async (endpointKey: string, ativoAtual: boolean) => {
    try {
      await toggleEndpointMutation.mutateAsync({
        endpointKey,
        ativo: !ativoAtual,
      });
      toast.success(
        ativoAtual
          ? `Endpoint '${endpointKey}' desativado`
          : `Endpoint '${endpointKey}' ativado`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao alterar status do endpoint",
      );
    }
  };

  const endpoints = endpointsQuery.data ?? [];
  const endpointsFiltrados = endpoints.filter(
    (e) =>
      e.nome.toLowerCase().includes(endpointSearch.toLowerCase()) ||
      e.endpointKey.toLowerCase().includes(endpointSearch.toLowerCase()) ||
      e.rota.toLowerCase().includes(endpointSearch.toLowerCase()),
  );

  const totalEndpoints = endpoints.length;
  const endpointsAtivosCount = endpoints.filter((e) => e.ativo).length;
  const endpointsDesativadosCount = endpoints.filter((e) => !e.ativo).length;
  const totalChamadasSum = endpoints.reduce((acc, e) => acc + e.totalChamadas, 0);

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
      {/* Cabeçalho da página */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integração ERP</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as chaves de API e monitore/controle a ativação dos endpoints de integração.
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

      <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as "chaves" | "monitor")}>
        <TabsList className="mb-2">
          <TabsTrigger value="chaves" className="gap-2">
            <Plug className="size-4" />
            Chaves de API
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2">
            <Server className="size-4" />
            Monitor de Endpoints
            {endpointsDesativadosCount > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                {endpointsDesativadosCount} desativados
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chaves" className="space-y-6">
          {/* Cards de Resumo de Chaves */}
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
        </TabsContent>

        <TabsContent value="monitor" className="space-y-6">
          {/* Cards de Resumo do Monitor */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="border-border/70 shadow-xs">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Server className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Endpoints Monitorados</p>
                  <p className="text-xl font-bold">{totalEndpoints}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-xs">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Activity className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Endpoints Ativos</p>
                  <p className="text-xl font-bold">{endpointsAtivosCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-xs">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Desativados</p>
                  <p className="text-xl font-bold">{endpointsDesativadosCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-xs">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Radio className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total de Chamadas</p>
                  <p className="text-xl font-bold">{totalChamadasSum.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Busca de endpoints */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome do endpoint ou rota..."
                value={endpointSearch}
                onChange={(e) => setEndpointSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => endpointsQuery.refetch()}
              disabled={endpointsQuery.isFetching}
            >
              Atualizar
            </Button>
          </div>

          {/* Tabela de Monitor de Endpoints */}
          <Card className="border border-border/70 shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">Endpoint / Recurso</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-48">Métodos HTTP</TableHead>
                  <TableHead className="w-44">Último Uso</TableHead>
                  <TableHead className="w-28 text-right">Chamadas</TableHead>
                  <TableHead className="w-36 text-center">Status / Controle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={6}>
                        <div className="h-10 w-full animate-pulse rounded bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : endpointsFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum endpoint encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  endpointsFiltrados.map((item) => (
                    <TableRow key={item.endpointKey} className={!item.ativo ? "bg-muted/20" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-primary">
                            <Server className="size-4" />
                          </div>
                          <div>
                            <p className="font-medium leading-tight">{item.nome}</p>
                            <code className="text-xs text-muted-foreground font-mono">{item.rota}</code>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.descricao}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.metodos.map((m) => (
                            <Badge
                              key={m}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 font-mono"
                            >
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dataHoraBr(item.ultimoUso)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {item.totalChamadas.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2.5">
                          <Switch
                            checked={item.ativo}
                            onCheckedChange={() =>
                              onToggleEndpointStatus(item.endpointKey, item.ativo)
                            }
                            disabled={toggleEndpointMutation.isPending}
                          />
                          <span className="text-xs font-medium w-16">
                            {item.ativo ? (
                              <span className="text-emerald-600 dark:text-emerald-400">Ativo</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">Desativado</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

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
