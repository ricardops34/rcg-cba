"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  metaCreateSchema,
  metaUpdateSchema,
  type Meta,
  type MetaCreate,
  type MetaUpdate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface MetaRow extends Meta {
  colaborador: {
    id: string;
    cargo: string;
    codigoErp: string | null;
    nomeReduzido: string | null;
    usuario: { nome: string; email: string };
  };
}

interface ColabOption {
  id: string;
  cargo: string;
  nomeReduzido: string | null;
  usuario: { nome: string };
}

const hoje = new Date();

export default function MetasPage() {
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<MetaRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [defaultApplied, setDefaultApplied] = useState(false);

  // Abre no período mais recente que tem meta cadastrada (a lista vem ordenada
  // por ano/mês desc), para não mostrar uma tela vazia quando o mês atual não
  // tiver metas ainda.
  const { data: ultima } = useQuery({
    queryKey: ["metas", "ultimo-periodo"],
    queryFn: () => apiFetch<{ data: MetaRow[] }>("/metas", { query: { pageSize: 1 } }),
  });
  useEffect(() => {
    const m = ultima?.data[0];
    if (m && !defaultApplied) {
      setAno(m.ano);
      setMes(m.mes);
      setDefaultApplied(true);
    }
  }, [ultima, defaultApplied]);

  const { data, isLoading, refetch } = useResourceList<MetaRow>("metas", {
    ano,
    mes,
    page,
    pageSize,
  } as never);

  const { data: colaboradores } = useQuery({
    queryKey: ["colaboradores", "select-metas"],
    queryFn: () => apiFetch<{ data: ColabOption[] }>("/colaboradores", { query: { pageSize: 200 } }),
  });
  const vendedores = (colaboradores?.data ?? []).filter(
    (c) => c.cargo === "vendedor" || c.cargo === "supervisor",
  );

  const { create, update, remove } = useResourceMutations<MetaCreate, MetaUpdate>("metas");

  const schema = editing ? metaUpdateSchema : metaCreateSchema;
  const form = useForm<MetaCreate>({
    resolver: zodResolver(schema as typeof metaCreateSchema),
    defaultValues: {
      colaboradorId: "",
      ano,
      mes,
      valorObjetivo: 0,
      metaClientes: 0,
      metaNovosClientes: 0,
      valorRealizado: 0,
      clientesPositivados: 0,
      observacao: "",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      colaboradorId: vendedores[0]?.id ?? "",
      ano,
      mes,
      valorObjetivo: 0,
      metaClientes: 0,
      metaNovosClientes: 0,
      valorRealizado: 0,
      clientesPositivados: 0,
      observacao: "",
    });
    setSheetOpen(true);
  };

  const openEdit = (m: MetaRow) => {
    setEditing(m);
    form.reset({
      colaboradorId: m.colaboradorId,
      ano: m.ano,
      mes: m.mes,
      valorObjetivo: m.valorObjetivo,
      metaClientes: m.metaClientes,
      metaNovosClientes: m.metaNovosClientes,
      valorRealizado: m.valorRealizado,
      clientesPositivados: m.clientesPositivados,
      observacao: m.observacao ?? "",
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: MetaCreate) => {
    try {
      if (editing) {
        const { colaboradorId: _omit, ...rest } = values;
        void _omit;
        await update.mutateAsync({ id: editing.id, input: rest });
        toast.success("Meta atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Meta cadastrada");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar meta");
    }
  };

  const onDelete = async (m: MetaRow) => {
    if (!confirm(`Excluir a meta de ${m.colaborador.usuario.nome} (${MESES[m.mes - 1]}/${m.ano})?`)) return;
    try {
      await remove.mutateAsync(m.id);
      toast.success("Meta excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir meta");
    }
  };

  const pct = (m: MetaRow) =>
    m.valorObjetivo > 0 ? Math.round((m.valorRealizado / m.valorObjetivo) * 100) : 0;

  const columns: ColumnDef<MetaRow>[] = [
    {
      header: "Vendedor",
      cell: (m) => (
        <div>
          <p className="font-medium">{m.colaborador.nomeReduzido || m.colaborador.usuario.nome}</p>
          <p className="text-xs text-muted-foreground">{m.colaborador.codigoErp ?? "—"}</p>
        </div>
      ),
    },
    { header: "Objetivo", cell: (m) => <span className="font-medium">{brl(m.valorObjetivo)}</span> },
    { header: "Realizado", cell: (m) => brl(m.valorRealizado) },
    {
      header: "% Meta",
      cell: (m) => {
        const p = pct(m);
        const tone =
          p >= 100 ? "bg-success/15 text-success" : p >= 60 ? "bg-warning/20 text-warning-foreground" : "bg-destructive/10 text-destructive";
        return <Badge className={tone} variant="outline">{p}%</Badge>;
      },
    },
    { header: "Meta clientes", cell: (m) => m.metaClientes || "—" },
    {
      header: "",
      className: "w-10",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(m)}>
              <Pencil className="size-4" /> Editar / lançar realizado
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(m)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Select value={String(mes)} onValueChange={(v) => { setMes(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((label, i) => (
                <SelectItem key={i} value={String(i + 1)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => { setAno(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Nova meta
        </Button>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(m) => m.id}
        isLoading={isLoading}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        onRowClick={openEdit}
        emptyMessage={`Nenhuma meta em ${MESES[mes - 1]}/${ano}.`}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar meta" : "Nova meta"}</SheetTitle>
          </SheetHeader>

          <form id="meta-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              {!editing && (
                <Field data-invalid={!!form.formState.errors.colaboradorId}>
                  <FieldLabel htmlFor="colaboradorId">Vendedor</FieldLabel>
                  <Select
                    value={form.watch("colaboradorId")}
                    onValueChange={(v) => form.setValue("colaboradorId", v, { shouldValidate: true })}
                  >
                    <SelectTrigger id="colaboradorId" className="w-full">
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nomeReduzido || c.usuario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[form.formState.errors.colaboradorId]} />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!form.formState.errors.mes}>
                  <FieldLabel htmlFor="mes">Mês</FieldLabel>
                  <Select
                    value={String(form.watch("mes"))}
                    onValueChange={(v) => form.setValue("mes", Number(v), { shouldValidate: true })}
                  >
                    <SelectTrigger id="mes" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((label, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-invalid={!!form.formState.errors.ano}>
                  <FieldLabel htmlFor="ano">Ano</FieldLabel>
                  <Input id="ano" type="number" {...form.register("ano")} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.valorObjetivo}>
                <FieldLabel htmlFor="valorObjetivo">Objetivo de faturamento (R$)</FieldLabel>
                <Input id="valorObjetivo" type="number" step="0.01" {...form.register("valorObjetivo")} />
                <FieldError errors={[form.formState.errors.valorObjetivo]} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="metaClientes">Meta de clientes</FieldLabel>
                  <Input id="metaClientes" type="number" {...form.register("metaClientes")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="metaNovosClientes">Novos clientes</FieldLabel>
                  <Input id="metaNovosClientes" type="number" {...form.register("metaNovosClientes")} />
                </Field>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Realizado
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="valorRealizado">Faturado (R$)</FieldLabel>
                    <Input id="valorRealizado" type="number" step="0.01" {...form.register("valorRealizado")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="clientesPositivados">Clientes positivados</FieldLabel>
                    <Input id="clientesPositivados" type="number" {...form.register("clientesPositivados")} />
                  </Field>
                </div>
              </div>

              <Field>
                <FieldLabel htmlFor="observacao">Observação (opcional)</FieldLabel>
                <Textarea id="observacao" rows={2} {...form.register("observacao")} />
              </Field>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button type="submit" form="meta-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
