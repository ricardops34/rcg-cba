"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  tituloReceberCreateSchema,
  type TituloReceber,
  type TituloReceberCreate,
  type TituloReceberUpdate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface TituloReceberRow extends TituloReceber {
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nomeReduzido: string | null; usuario: { nome: string } } | null;
}
interface ColabOption {
  id: string;
  vinculoId: string | null;
  nomeReduzido: string | null;
  nome: string;
}
interface ClienteOption {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
}

const NENHUM = "__none__";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formulário usa datas como string (input type="date"); convertidas para Date
// apenas no submit, para não acoplar a UI ao coerce.date() do contrato.
const tituloFormSchema = tituloReceberCreateSchema.extend({
  emissao: z.string().min(1, "Informe a emissão"),
  vencimento: z.string().min(1, "Informe o vencimento"),
  dtBaixa: z.string().optional(),
});
type TituloFormValues = z.infer<typeof tituloFormSchema>;

const EMPTY: TituloFormValues = {
  clienteId: null,
  colaboradorId: null,
  numero: "",
  parcela: "",
  prefixo: "",
  tipo: "",
  emissao: new Date().toISOString().slice(0, 10),
  vencimento: new Date().toISOString().slice(0, 10),
  valor: 0,
  saldo: 0,
  dtBaixa: "",
  historico: "",
  ativo: true,
};

function situacao(t: TituloReceberRow) {
  if (t.saldo <= 0 || t.dtBaixa) return <Badge variant="outline">Pago</Badge>;
  if (new Date(t.vencimento) < new Date()) return <Badge variant="destructive">Vencido</Badge>;
  return <Badge variant="outline">Aberto</Badge>;
}

export default function TitulosReceberPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<TituloReceberRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<TituloReceberRow>("titulos-receber", {
    search,
    page,
    pageSize,
  });

  const { data: colaboradores } = useQuery({
    queryKey: ["usuarios", "select-titulos-receber"],
    queryFn: () => apiFetch<{ data: ColabOption[] }>("/usuarios", { query: { pageSize: 100 } }),
  });
  const vendedores = (colaboradores?.data ?? []).filter((c) => c.vinculoId);

  const { data: clientes } = useQuery({
    queryKey: ["clientes", "select-titulos-receber"],
    queryFn: () => apiFetch<{ data: ClienteOption[] }>("/clientes", { query: { pageSize: 100 } }),
  });

  const { create, update, remove } = useResourceMutations<TituloReceberCreate, TituloReceberUpdate>("titulos-receber");

  const form = useForm<TituloFormValues>({
    resolver: zodResolver(tituloFormSchema),
    defaultValues: EMPTY,
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
    setSheetOpen(true);
  };

  const openEdit = (t: TituloReceberRow) => {
    setEditing(t);
    form.reset({
      clienteId: t.clienteId ?? null,
      colaboradorId: t.colaboradorId ?? null,
      numero: t.numero,
      parcela: t.parcela ?? "",
      prefixo: t.prefixo ?? "",
      tipo: t.tipo ?? "",
      emissao: new Date(t.emissao).toISOString().slice(0, 10),
      vencimento: new Date(t.vencimento).toISOString().slice(0, 10),
      valor: t.valor,
      saldo: t.saldo,
      dtBaixa: t.dtBaixa ? new Date(t.dtBaixa).toISOString().slice(0, 10) : "",
      historico: t.historico ?? "",
      ativo: t.ativo,
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: TituloFormValues) => {
    const payload = {
      ...values,
      emissao: new Date(values.emissao),
      vencimento: new Date(values.vencimento),
      dtBaixa: values.dtBaixa ? new Date(values.dtBaixa) : null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: payload });
        toast.success("Título atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Título lançado");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar título");
    }
  };

  const onDelete = async (t: TituloReceberRow) => {
    if (!confirm(`Excluir o título nº ${t.numero}?`)) return;
    try {
      await remove.mutateAsync(t.id);
      toast.success("Título excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir título");
    }
  };

  const columns: ColumnDef<TituloReceberRow>[] = [
    {
      header: "Título",
      cell: (t) => (
        <span className="font-mono text-xs">
          {t.prefixo ? <span className="text-muted-foreground">{t.prefixo} </span> : null}
          {t.numero}
          {t.parcela ? `/${t.parcela}` : ""}
        </span>
      ),
    },
    {
      header: "Cliente",
      cell: (t) =>
        t.cliente ? (t.cliente.nomeFantasia || t.cliente.razaoSocial) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Vendedor",
      cell: (t) =>
        t.colaborador ? (
          t.colaborador.nomeReduzido || t.colaborador.usuario?.nome
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Emissão",
      cell: (t) => new Date(t.emissao).toLocaleDateString("pt-BR"),
    },
    {
      header: "Vencimento",
      cell: (t) => new Date(t.vencimento).toLocaleDateString("pt-BR"),
    },
    {
      header: "Valor",
      cell: (t) => brl(t.valor),
    },
    {
      header: "Saldo",
      cell: (t) => <span className="font-semibold">{brl(t.saldo)}</span>,
    },
    { header: "Situação", cell: (t) => situacao(t) },
    {
      header: "",
      className: "w-10",
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(t)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(t)}>
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
        onCreate={openCreate}
        createLabel="Novo título"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={openEdit}
        emptyMessage="Nenhum título a receber."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar título" : "Novo título a receber"}</SheetTitle>
          </SheetHeader>

          <form
            id="titulo-receber-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex-1 overflow-y-auto px-4"
          >
            <FieldGroup>
              <div className="grid grid-cols-3 gap-3">
                <Field data-invalid={!!form.formState.errors.numero}>
                  <FieldLabel htmlFor="numero">Número</FieldLabel>
                  <Input id="numero" {...form.register("numero")} />
                  <FieldError errors={[form.formState.errors.numero]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="parcela">Parcela</FieldLabel>
                  <Input id="parcela" {...form.register("parcela")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prefixo">Prefixo</FieldLabel>
                  <Input id="prefixo" {...form.register("prefixo")} />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
                  <Input id="tipo" placeholder="NF, BOL..." {...form.register("tipo")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.emissao}>
                  <FieldLabel htmlFor="emissao">Emissão</FieldLabel>
                  <Input id="emissao" type="date" {...form.register("emissao")} />
                  <FieldError errors={[form.formState.errors.emissao]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.vencimento}>
                  <FieldLabel htmlFor="vencimento">Vencimento</FieldLabel>
                  <Input id="vencimento" type="date" {...form.register("vencimento")} />
                  <FieldError errors={[form.formState.errors.vencimento]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="clienteId">Cliente</FieldLabel>
                <Select
                  value={form.watch("clienteId") ?? NENHUM}
                  onValueChange={(v) =>
                    form.setValue("clienteId", v === NENHUM ? null : v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="clienteId" className="w-full">
                    <SelectValue placeholder="Sem cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Sem cliente</SelectItem>
                    {(clientes?.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nomeFantasia || c.razaoSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="colaboradorId">Vendedor</FieldLabel>
                <Select
                  value={form.watch("colaboradorId") ?? NENHUM}
                  onValueChange={(v) =>
                    form.setValue("colaboradorId", v === NENHUM ? null : v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="colaboradorId" className="w-full">
                    <SelectValue placeholder="Sem vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Sem vendedor</SelectItem>
                    {vendedores.map((c) => (
                      <SelectItem key={c.id} value={c.vinculoId!}>
                        {c.nomeReduzido || c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="valor">Valor</FieldLabel>
                  <Input id="valor" type="number" step="any" {...form.register("valor", { valueAsNumber: true })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="saldo">Saldo em aberto</FieldLabel>
                  <Input id="saldo" type="number" step="any" {...form.register("saldo", { valueAsNumber: true })} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="dtBaixa">Data da baixa (opcional)</FieldLabel>
                <Input id="dtBaixa" type="date" {...form.register("dtBaixa")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="historico">Histórico</FieldLabel>
                <Input id="historico" {...form.register("historico")} />
              </Field>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Título ativo
              </label>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button type="submit" form="titulo-receber-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Lançar título"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
