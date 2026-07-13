"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  produtoCreateSchema,
  produtoUpdateSchema,
  type Produto,
  type ProdutoCreate,
  type ProdutoUpdate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const nanToNull = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? null : v;

export default function ProdutosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<Produto>("produtos", {
    search,
    page,
    pageSize,
  });

  const { create, update, remove } = useResourceMutations<ProdutoCreate, ProdutoUpdate>("produtos");

  const schema = editing ? produtoUpdateSchema : produtoCreateSchema;
  const empty: ProdutoCreate = {
    codigoErp: "",
    descricao: "",
    unidade: "",
    categoria: "",
    subCategoria: "",
    marca: "",
    codigoBarras: "",
    ncm: "",
    qtdEmbalagem: null,
    peso: null,
    ultimoPreco: null,
    observacao: "",
    ativo: true,
  };
  const form = useForm<ProdutoCreate>({
    resolver: zodResolver(schema as typeof produtoCreateSchema),
    defaultValues: empty,
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(empty);
    setSheetOpen(true);
  };

  const openEdit = (p: Produto) => {
    setEditing(p);
    form.reset({
      codigoErp: p.codigoErp,
      descricao: p.descricao,
      unidade: p.unidade ?? "",
      categoria: p.categoria ?? "",
      subCategoria: p.subCategoria ?? "",
      marca: p.marca ?? "",
      codigoBarras: p.codigoBarras ?? "",
      ncm: p.ncm ?? "",
      qtdEmbalagem: p.qtdEmbalagem ?? null,
      peso: p.peso ?? null,
      ultimoPreco: p.ultimoPreco ?? null,
      observacao: p.observacao ?? "",
      ativo: p.ativo,
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: ProdutoCreate) => {
    const payload: ProdutoCreate = {
      ...values,
      qtdEmbalagem: nanToNull(values.qtdEmbalagem),
      peso: nanToNull(values.peso),
      ultimoPreco: nanToNull(values.ultimoPreco),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: payload });
        toast.success("Produto atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Produto cadastrado");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar produto");
    }
  };

  const onDelete = async (p: Produto) => {
    if (!confirm(`Excluir o produto "${p.descricao}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Produto excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir produto");
    }
  };

  const columns: ColumnDef<Produto>[] = [
    { header: "Código", cell: (p) => <span className="font-mono text-xs">{p.codigoErp}</span> },
    {
      header: "Produto",
      cell: (p) => (
        <div>
          <p className="font-medium">{p.descricao}</p>
          {p.marca && <p className="text-xs text-muted-foreground">{p.marca}</p>}
        </div>
      ),
    },
    {
      header: "Categoria",
      cell: (p) =>
        p.categoria ? (
          <span>
            {p.categoria}
            {p.subCategoria && (
              <span className="text-muted-foreground"> · {p.subCategoria}</span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    { header: "Unidade", cell: (p) => p.unidade || "—" },
    {
      header: "Últ. preço",
      cell: (p) =>
        p.ultimoPreco != null
          ? p.ultimoPreco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "—",
    },
    { header: "Status", cell: (p) => <StatusDot active={p.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(p)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
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
        createLabel="Novo produto"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(p) => p.id}
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
        emptyMessage="Nenhum produto cadastrado."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar produto" : "Novo produto"}</SheetTitle>
          </SheetHeader>

          <form id="produto-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!form.formState.errors.codigoErp}>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                  <FieldError errors={[form.formState.errors.codigoErp]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="unidade">Unidade</FieldLabel>
                  <Input id="unidade" maxLength={4} {...form.register("unidade")} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.descricao}>
                <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                <Input id="descricao" {...form.register("descricao")} />
                <FieldError errors={[form.formState.errors.descricao]} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="categoria">Categoria</FieldLabel>
                  <Input id="categoria" {...form.register("categoria")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="subCategoria">Subcategoria</FieldLabel>
                  <Input id="subCategoria" {...form.register("subCategoria")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="marca">Marca</FieldLabel>
                  <Input id="marca" {...form.register("marca")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="codigoBarras">Código de barras</FieldLabel>
                  <Input id="codigoBarras" {...form.register("codigoBarras")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="ncm">NCM</FieldLabel>
                  <Input id="ncm" {...form.register("ncm")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.qtdEmbalagem}>
                  <FieldLabel htmlFor="qtdEmbalagem">Qtd. embalagem</FieldLabel>
                  <Input
                    id="qtdEmbalagem"
                    type="number"
                    step="any"
                    {...form.register("qtdEmbalagem", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.qtdEmbalagem]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!form.formState.errors.peso}>
                  <FieldLabel htmlFor="peso">Peso</FieldLabel>
                  <Input id="peso" type="number" step="any" {...form.register("peso", { setValueAs: emptyToNull })} />
                  <FieldError errors={[form.formState.errors.peso]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.ultimoPreco}>
                  <FieldLabel htmlFor="ultimoPreco">Último preço</FieldLabel>
                  <Input
                    id="ultimoPreco"
                    type="number"
                    step="any"
                    {...form.register("ultimoPreco", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.ultimoPreco]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                <Input id="observacao" {...form.register("observacao")} />
              </Field>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Produto ativo
              </label>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button type="submit" form="produto-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
