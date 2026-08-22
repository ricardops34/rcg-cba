"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Pin, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** `datetime-local` fala neste formato; o backend fala ISO. */
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

/**
 * Comunicados — o mural que aparece na tela inicial de todo mundo.
 *
 * Editar em diálogo, e não em página própria: o cadastro tem seis campos e
 * quem publica um aviso costuma publicar vários seguidos.
 */
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

  // Lista de perfis para o destino. São globais (não têm empresaId), então a
  // mesma lista serve a qualquer empresa ativa.
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
      // Sem data de início, o backend usa "agora" — publicar já.
      ...(form.inicioEm ? { inicioEm: new Date(form.inicioEm) } : {}),
      fimEm: form.fimEm ? new Date(form.fimEm) : null,
      fixado: form.fixado,
      ativo: form.ativo,
      perfisIds: form.perfisIds,
    };
    try {
      if (editando) {
        await update.mutateAsync({ id: editando.id, input });
        toast.success("Comunicado atualizado");
      } else {
        await create.mutateAsync(input);
        toast.success("Comunicado publicado");
      }
      setAberto(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar");
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

  const columns: ColumnDef<Comunicado>[] = [
    {
      header: "Título",
      sortKey: "titulo",
      cell: (c) => (
        <span className="flex items-center gap-1.5 font-medium">
          {c.fixado && <Pin className="size-3.5 shrink-0 text-primary" />}
          {c.titulo}
        </span>
      ),
    },
    {
      header: "Destino",
      cell: (c) =>
        c.perfisIds.length === 0
          ? "Todos"
          : perfis
              .filter((p) => c.perfisIds.includes(p.id))
              .map((p) => p.nome)
              .join(", ") || `${c.perfisIds.length} perfis`,
    },
    { header: "Início", sortKey: "inicioEm", cell: (c) => dataBr(c.inicioEm) },
    {
      header: "Fim",
      sortKey: "fimEm",
      cell: (c) => (c.fimEm ? dataBr(c.fimEm) : "sem prazo"),
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
              className="size-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(ev) => ev.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => abrirEdicao(c)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => excluir(c)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
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
      />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar comunicado" : "Novo comunicado"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="titulo">Título</FieldLabel>
              <Input
                id="titulo"
                value={form.titulo}
                maxLength={120}
                onChange={(e) =>
                  setForm((f) => ({ ...f, titulo: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="texto">Texto</FieldLabel>
              <Textarea
                id="texto"
                rows={5}
                value={form.texto}
                onChange={(e) =>
                  setForm((f) => ({ ...f, texto: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="inicioEm">Publicar em</FieldLabel>
                <Input
                  id="inicioEm"
                  type="datetime-local"
                  value={form.inicioEm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inicioEm: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Em branco: publica agora.
                </p>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="fimEm">Sair em</FieldLabel>
                <Input
                  id="fimEm"
                  type="datetime-local"
                  value={form.fimEm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fimEm: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Em branco: sem prazo.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Quem vê</FieldLabel>
              <p className="text-xs text-muted-foreground">
                Nenhum perfil marcado = todos os usuários da empresa, inclusive
                perfis criados depois.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {perfis.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={form.perfisIds.includes(p.id)}
                      onCheckedChange={() => alternarPerfil(p.id)}
                    />
                    {p.nome}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.fixado}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, fixado: v }))}
                />
                Fixar no topo
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Ativo
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
