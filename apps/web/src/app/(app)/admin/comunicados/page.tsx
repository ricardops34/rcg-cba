"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Pin, Trash2, Megaphone, CheckCircle2, Users, Plus } from "lucide-react";
import type { Comunicado, Perfil } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function paraInputLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

interface FormState {
  titulo: string;
  texto: string;
  inicioEm: string;
  fimEm: string;
  fixado: boolean;
  ativo: boolean;
  perfisIds: string[];
}

const FORM_VAZIO: FormState = {
  titulo: "",
  texto: "",
  inicioEm: "",
  fimEm: "",
  fixado: false,
  ativo: true,
  perfisIds: [],
};

export default function ComunicadosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("inicioEm");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");

  const [editando, setEditando] = useState<Comunicado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<Comunicado>("comunicados", {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    });
  const { create, update, remove } = useResourceMutations("comunicados");

  const perfisQuery = useResourceList<Perfil>("perfis", {
    page: 1,
    pageSize: 100,
    sortBy: "nome",
    sortOrder: "asc",
  });
  const perfis = perfisQuery.data?.data ?? [];

  useEffect(() => {
    if (!aberto) return;
    setForm(
      editando
        ? {
            titulo: editando.titulo,
            texto: editando.texto,
            inicioEm: paraInputLocal(editando.inicioEm),
            fimEm: paraInputLocal(editando.fimEm),
            fixado: editando.fixado,
            ativo: editando.ativo,
            perfisIds: editando.perfisIds,
          }
        : FORM_VAZIO,
    );
  }, [aberto, editando]);

  const abrirNovo = () => {
    setEditando(null);
    setAberto(true);
  };

  const abrirEdicao = (c: Comunicado) => {
    setEditando(c);
    setAberto(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim() || !form.texto.trim()) {
      toast.error("Título e texto são obrigatórios");
      return;
    }
    const input = {
      titulo: form.titulo.trim(),
      texto: form.texto.trim(),
      ...(form.inicioEm ? { inicioEm: new Date(form.inicioEm) } : {}),
      fimEm: form.fimEm ? new Date(form.fimEm) : null,
      fixado: form.fixado,
      ativo: form.ativo,
      perfisIds: form.perfisIds,
    };
    try {
      if (editando) {
        await update.mutateAsync({ id: editando.id, input });
        toast.success("Comunicado atualizado com sucesso");
      } else {
        await create.mutateAsync(input);
        toast.success("Comunicado publicado com sucesso");
      }
      setAberto(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar comunicado");
    }
  };

  const excluir = async (c: Comunicado) => {
    if (!confirm(`Excluir o comunicado "${c.titulo}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Comunicado excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir");
    }
  };

  const alternarPerfil = (perfilId: string) =>
    setForm((f) => ({
      ...f,
      perfisIds: f.perfisIds.includes(perfilId)
        ? f.perfisIds.filter((id) => id !== perfilId)
        : [...f.perfisIds, perfilId],
    }));

  const totalComunicados = data?.total ?? 0;
  const listaComunicados = data?.data ?? [];
  const totalAtivos = listaComunicados.filter((c) => c.ativo).length;
  const totalFixados = listaComunicados.filter((c) => c.fixado).length;

  const columns: ColumnDef<Comunicado>[] = [
    {
      header: "Título",
      sortKey: "titulo",
      cell: (c) => (
        <div className="flex items-center gap-2">
          {c.fixado && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-1.5 py-0">
              <Pin className="h-3 w-3 mr-1 inline" /> Fixado
            </Badge>
          )}
          <span className="font-semibold text-sm text-foreground">{c.titulo}</span>
        </div>
      ),
    },
    {
      header: "Destino",
      cell: (c) =>
        c.perfisIds.length === 0 ? (
          <Badge variant="outline" className="text-xs">Todos os Perfis</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {perfis
              .filter((p) => c.perfisIds.includes(p.id))
              .map((p) => p.nome)
              .join(", ") || `${c.perfisIds.length} perfis`}
          </span>
        ),
    },
    { header: "Início", sortKey: "inicioEm", cell: (c) => <span className="text-xs font-mono">{dataBr(c.inicioEm)}</span> },
    {
      header: "Fim",
      sortKey: "fimEm",
      cell: (c) => <span className="text-xs font-mono">{c.fimEm ? dataBr(c.fimEm) : "Sem prazo"}</span>,
    },
    {
      header: "Status",
      sortKey: "ativo",
      cell: (c) => (
        <StatusDot active={c.ativo} labelOn="Ativo" labelOff="Inativo" />
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
              className="h-8 w-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(ev) => ev.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => abrirEdicao(c)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => excluir(c)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comunicados Internos</h1>
          <p className="text-sm text-muted-foreground">
            Crie avisos e informativos exibidos no mural inicial para as equipes da empresa.
          </p>
        </div>
        <Button onClick={abrirNovo} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo comunicado
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Avisos
              </p>
              <p className="text-2xl font-bold mt-1">{totalComunicados}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Comunicados Ativos
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAtivos}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  No ar
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avisos Fixados
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {totalFixados}
                </p>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                  Topo do mural
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
              <Pin className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={abrirNovo}
        createLabel="Novo comunicado"
      />

      <StatusQuickFilter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
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
        onRowClick={abrirEdicao}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        emptyMessage="Nenhum comunicado cadastrado."
      />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              {editando ? "Editar Comunicado" : "Novo Comunicado"}
            </DialogTitle>
          </DialogHeader>

          <FieldGroup className="space-y-4 py-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="titulo">Título do Comunicado</FieldLabel>
              <Input
                id="titulo"
                value={form.titulo}
                maxLength={120}
                placeholder="Ex: Manutenção agendada no sistema"
                onChange={(e) =>
                  setForm((f) => ({ ...f, titulo: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="texto">Conteúdo da Mensagem</FieldLabel>
              <Textarea
                id="texto"
                rows={5}
                placeholder="Escreva a mensagem que será exibida para os usuários..."
                value={form.texto}
                onChange={(e) =>
                  setForm((f) => ({ ...f, texto: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="inicioEm">Publicar em (Início)</FieldLabel>
                <Input
                  id="inicioEm"
                  type="datetime-local"
                  value={form.inicioEm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inicioEm: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Em branco: publica imediatamente.
                </p>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="fimEm">Encerrar em (Fim)</FieldLabel>
                <Input
                  id="fimEm"
                  type="datetime-local"
                  value={form.fimEm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fimEm: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Em branco: permanece sem data limite.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <FieldLabel className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                Destinatários (Perfis de Acesso)
              </FieldLabel>
              <p className="text-xs text-muted-foreground">
                Deixe desmarcado para enviar a todos os usuários da empresa.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                {perfis.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 text-sm rounded border p-2 hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      checked={form.perfisIds.includes(p.id)}
                      onCheckedChange={() => alternarPerfil(p.id)}
                    />
                    <span>{p.nome}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2 border-t">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Switch
                  checked={form.fixado}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, fixado: v }))}
                />
                Fixar no topo do mural
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Ativo
              </label>
            </div>
          </FieldGroup>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? "Salvando..." : "Salvar Comunicado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

