"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  notaSaidaCreateSchema,
  type NotaSaida,
  type NotaSaidaCreate,
  type NotaSaidaUpdate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
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
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

interface NotaSaidaRow extends NotaSaida {
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nomeReduzido: string | null; usuario: { nome: string } } | null;
}
interface ColabOption {
  id: string;
  cargo: string;
  nomeReduzido: string | null;
  usuario: { nome: string };
}
interface ClienteOption {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
}

const NENHUM = "__none__";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formulário usa dtEmissao como string (input type="date"); convertido para
// Date apenas no submit, para não acoplar a UI ao coerce.date() do contrato.
const notaSaidaFormSchema = notaSaidaCreateSchema.extend({
  dtEmissao: z.string().min(1, "Informe a data de emissão"),
});
type NotaSaidaFormValues = z.infer<typeof notaSaidaFormSchema>;

const EMPTY: NotaSaidaFormValues = {
  clienteId: null,
  colaboradorId: null,
  numero: "",
  serie: "",
  especieFiscal: "NF-e",
  dtEmissao: new Date().toISOString().slice(0, 10),
  vlrIcms: 0,
  vlrIpi: 0,
  vlrFrete: 0,
  vlrDesconto: 0,
  chaveNfe: "",
  observacao: "",
  comodato: false,
  ativo: true,
  itens: [{ descricao: "", quantidade: 1, vlrUnitario: 0, vlrDesconto: 0 }],
};

export default function NotasSaidaPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<NotaSaidaRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<NotaSaidaRow>("notas-saida", {
    search,
    page,
    pageSize,
  });

  const { data: colaboradores } = useQuery({
    queryKey: ["colaboradores", "select-notas-saida"],
    queryFn: () => apiFetch<{ data: ColabOption[] }>("/colaboradores", { query: { pageSize: 200 } }),
  });
  const vendedores = (colaboradores?.data ?? []).filter(
    (c) => c.cargo === "vendedor" || c.cargo === "supervisor",
  );

  const { data: clientes } = useQuery({
    queryKey: ["clientes", "select-notas-saida"],
    queryFn: () => apiFetch<{ data: ClienteOption[] }>("/clientes", { query: { pageSize: 200 } }),
  });

  const { create, update, remove } = useResourceMutations<NotaSaidaCreate, NotaSaidaUpdate>("notas-saida");

  const form = useForm<NotaSaidaFormValues>({
    resolver: zodResolver(notaSaidaFormSchema),
    defaultValues: EMPTY,
  });
  const { fields, append, remove: removeItem } = useFieldArray({ control: form.control, name: "itens" });
  const itensAtuais = form.watch("itens");
  const vlrDescontoGeral = form.watch("vlrDesconto") || 0;
  const totalItens = itensAtuais.reduce(
    (s, it) => s + (Number(it.quantidade) || 0) * (Number(it.vlrUnitario) || 0) - (Number(it.vlrDesconto) || 0),
    0,
  );
  const totalNota = totalItens - vlrDescontoGeral;

  const openCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
    setSheetOpen(true);
  };

  const openEdit = (n: NotaSaidaRow) => {
    setEditing(n);
    form.reset({
      clienteId: n.clienteId ?? null,
      colaboradorId: n.colaboradorId ?? null,
      numero: n.numero,
      serie: n.serie ?? "",
      especieFiscal: n.especieFiscal ?? "",
      dtEmissao: new Date(n.dtEmissao).toISOString().slice(0, 10),
      vlrIcms: n.vlrIcms,
      vlrIpi: n.vlrIpi,
      vlrFrete: n.vlrFrete,
      vlrDesconto: n.vlrDesconto,
      chaveNfe: n.chaveNfe ?? "",
      observacao: n.observacao ?? "",
      ativo: n.ativo,
      itens: n.itens.map((it) => ({
        descricao: it.descricao,
        quantidade: it.quantidade,
        vlrUnitario: it.vlrUnitario,
        vlrDesconto: it.vlrDesconto,
      })),
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: NotaSaidaFormValues) => {
    const payload = { ...values, dtEmissao: new Date(values.dtEmissao) };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: payload });
        toast.success("Nota fiscal atualizada");
      } else {
        await create.mutateAsync(payload);
        toast.success("Nota fiscal lançada");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar nota fiscal");
    }
  };

  const onDelete = async (n: NotaSaidaRow) => {
    if (!confirm(`Excluir a nota fiscal nº ${n.numero}?`)) return;
    try {
      await remove.mutateAsync(n.id);
      toast.success("Nota fiscal excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir nota fiscal");
    }
  };

  const columns: ColumnDef<NotaSaidaRow>[] = [
    {
      header: "Nota",
      cell: (n) => (
        <span className="font-mono text-xs">
          {n.numero}
          {n.serie ? `/${n.serie}` : ""}
        </span>
      ),
    },
    {
      header: "Cliente",
      cell: (n) =>
        n.cliente ? (n.cliente.nomeFantasia || n.cliente.razaoSocial) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Vendedor",
      cell: (n) =>
        n.colaborador ? (
          n.colaborador.nomeReduzido || n.colaborador.usuario.nome
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Emissão",
      cell: (n) => new Date(n.dtEmissao).toLocaleDateString("pt-BR"),
    },
    {
      header: "Valor",
      cell: (n) => <span className="font-medium">{brl(n.vlrItens)}</span>,
    },
    { header: "Status", cell: (n) => <StatusDot active={n.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (n) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(n)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(n)}>
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
        createLabel="Nova nota fiscal"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(n) => n.id}
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
        emptyMessage="Nenhuma nota fiscal de saída lançada."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar nota fiscal" : "Nova nota fiscal de saída"}</SheetTitle>
          </SheetHeader>

          <form
            id="nota-saida-form"
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
                  <FieldLabel htmlFor="serie">Série</FieldLabel>
                  <Input id="serie" {...form.register("serie")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.dtEmissao}>
                  <FieldLabel htmlFor="dtEmissao">Emissão</FieldLabel>
                  <Input id="dtEmissao" type="date" {...form.register("dtEmissao")} />
                  <FieldError errors={[form.formState.errors.dtEmissao]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                        <SelectItem key={c.id} value={c.id}>
                          {c.nomeReduzido || c.usuario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="especieFiscal">Espécie fiscal</FieldLabel>
                  <Input id="especieFiscal" {...form.register("especieFiscal")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="chaveNfe">Chave NF-e</FieldLabel>
                  <Input id="chaveNfe" {...form.register("chaveNfe")} />
                </Field>
              </div>

              <div className="rounded-lg border border-border/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Itens</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ descricao: "", quantidade: 1, vlrUnitario: 0, vlrDesconto: 0 })}
                  >
                    <Plus className="size-4" /> Item
                  </Button>
                </div>

                <div className="space-y-2">
                  {fields.map((f, i) => {
                    const qtd = Number(itensAtuais[i]?.quantidade) || 0;
                    const unit = Number(itensAtuais[i]?.vlrUnitario) || 0;
                    const desc = Number(itensAtuais[i]?.vlrDesconto) || 0;
                    const totalItem = qtd * unit - desc;
                    return (
                      <div key={f.id} className="grid grid-cols-12 items-end gap-2">
                        <div className="col-span-4">
                          {i === 0 && <FieldLabel className="text-xs">Descrição</FieldLabel>}
                          <Input {...form.register(`itens.${i}.descricao`)} />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <FieldLabel className="text-xs">Qtd.</FieldLabel>}
                          <Input
                            type="number"
                            step="any"
                            {...form.register(`itens.${i}.quantidade`, { valueAsNumber: true })}
                          />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <FieldLabel className="text-xs">Vlr. unit.</FieldLabel>}
                          <Input
                            type="number"
                            step="any"
                            {...form.register(`itens.${i}.vlrUnitario`, { valueAsNumber: true })}
                          />
                        </div>
                        <div className="col-span-2">
                          {i === 0 && <FieldLabel className="text-xs">Desconto</FieldLabel>}
                          <Input
                            type="number"
                            step="any"
                            {...form.register(`itens.${i}.vlrDesconto`, { valueAsNumber: true })}
                          />
                        </div>
                        <div className="col-span-1 pb-2 text-right text-xs text-muted-foreground">
                          {brl(totalItem)}
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={fields.length <= 1}
                            onClick={() => removeItem(i)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <FieldError errors={[form.formState.errors.itens as { message?: string } | undefined]} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <FieldLabel htmlFor="vlrIcms">ICMS</FieldLabel>
                  <Input id="vlrIcms" type="number" step="any" {...form.register("vlrIcms", { valueAsNumber: true })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="vlrIpi">IPI</FieldLabel>
                  <Input id="vlrIpi" type="number" step="any" {...form.register("vlrIpi", { valueAsNumber: true })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="vlrFrete">Frete</FieldLabel>
                  <Input id="vlrFrete" type="number" step="any" {...form.register("vlrFrete", { valueAsNumber: true })} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="vlrDesconto">Desconto geral da nota</FieldLabel>
                <Input
                  id="vlrDesconto"
                  type="number"
                  step="any"
                  {...form.register("vlrDesconto", { valueAsNumber: true })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                <Input id="observacao" {...form.register("observacao")} />
              </Field>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("ativo")}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  Nota ativa
                </label>
                <span className="text-sm font-semibold">Total: {brl(totalNota)}</span>
              </div>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button type="submit" form="nota-saida-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Lançar nota"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
