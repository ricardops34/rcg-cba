"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  clienteCreateSchema,
  clienteUpdateSchema,
  type Cliente,
  type ClienteCreate,
  type ClienteUpdate,
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface ClienteRow extends Cliente {
  colaborador: { id: string; nomeReduzido: string | null; usuario: { nome: string } } | null;
}
interface ColabOption {
  id: string;
  vinculoId: string | null;
  nomeReduzido: string | null;
  nome: string;
}

const NENHUM = "__none__";

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<ClienteRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<ClienteRow>("clientes", {
    search,
    page,
    pageSize,
  });

  const { data: colaboradores } = useQuery({
    queryKey: ["usuarios", "select-clientes"],
    queryFn: () => apiFetch<{ data: ColabOption[] }>("/usuarios", { query: { pageSize: 200 } }),
  });
  const vendedores = (colaboradores?.data ?? []).filter((c) => c.vinculoId);

  const { create, update, remove } = useResourceMutations<ClienteCreate, ClienteUpdate>("clientes");

  const schema = editing ? clienteUpdateSchema : clienteCreateSchema;
  const empty: ClienteCreate = {
    razaoSocial: "",
    nomeFantasia: "",
    codigoErp: "",
    cnpjCpf: "",
    inscricaoEstadual: "",
    colaboradorId: null,
    contato: "",
    email: "",
    telefone: "",
    celular: "",
    endereco: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
    ativo: true,
  };
  const form = useForm<ClienteCreate>({
    resolver: zodResolver(schema as typeof clienteCreateSchema),
    defaultValues: empty,
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(empty);
    setSheetOpen(true);
  };

  const openEdit = (c: ClienteRow) => {
    setEditing(c);
    form.reset({
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia ?? "",
      codigoErp: c.codigoErp ?? "",
      cnpjCpf: c.cnpjCpf ?? "",
      inscricaoEstadual: c.inscricaoEstadual ?? "",
      colaboradorId: c.colaboradorId ?? null,
      contato: c.contato ?? "",
      email: c.email ?? "",
      telefone: c.telefone ?? "",
      celular: c.celular ?? "",
      endereco: c.endereco ?? "",
      bairro: c.bairro ?? "",
      municipio: c.municipio ?? "",
      uf: c.uf ?? "",
      cep: c.cep ?? "",
      ativo: c.ativo,
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: ClienteCreate) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: values });
        toast.success("Cliente atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Cliente cadastrado");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar cliente");
    }
  };

  const onDelete = async (c: ClienteRow) => {
    if (!confirm(`Excluir o cliente "${c.razaoSocial}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Cliente excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir cliente");
    }
  };

  const columns: ColumnDef<ClienteRow>[] = [
    { header: "Código", cell: (c) => <span className="font-mono text-xs">{c.codigoErp ?? "—"}</span> },
    {
      header: "Cliente",
      cell: (c) => (
        <div>
          <p className="font-medium">{c.nomeFantasia || c.razaoSocial}</p>
          {c.nomeFantasia && <p className="text-xs text-muted-foreground">{c.razaoSocial}</p>}
        </div>
      ),
    },
    { header: "CNPJ/CPF", cell: (c) => <span className="text-sm">{c.cnpjCpf ?? "—"}</span> },
    {
      header: "Município",
      cell: (c) => (c.municipio ? `${c.municipio}${c.uf ? ` / ${c.uf}` : ""}` : "—"),
    },
    {
      header: "Vendedor",
      cell: (c) =>
        c.colaborador ? (
          c.colaborador.nomeReduzido || c.colaborador.usuario?.nome
        ) : (
          <span className="text-muted-foreground">Sem vendedor</span>
        ),
    },
    { header: "Status", cell: (c) => <StatusDot active={c.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
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
        createLabel="Novo cliente"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
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
        emptyMessage="Nenhum cliente na carteira."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar cliente" : "Novo cliente"}</SheetTitle>
          </SheetHeader>

          <form id="cliente-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.razaoSocial}>
                <FieldLabel htmlFor="razaoSocial">Razão social</FieldLabel>
                <Input id="razaoSocial" {...form.register("razaoSocial")} />
                <FieldError errors={[form.formState.errors.razaoSocial]} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="nomeFantasia">Nome fantasia</FieldLabel>
                  <Input id="nomeFantasia" {...form.register("nomeFantasia")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!form.formState.errors.cnpjCpf}>
                  <FieldLabel htmlFor="cnpjCpf">CNPJ / CPF</FieldLabel>
                  <Input id="cnpjCpf" {...form.register("cnpjCpf")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inscricaoEstadual">Inscrição estadual</FieldLabel>
                  <Input id="inscricaoEstadual" {...form.register("inscricaoEstadual")} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="colaboradorId">Vendedor responsável</FieldLabel>
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
                  <FieldLabel htmlFor="contato">Contato</FieldLabel>
                  <Input id="contato" {...form.register("contato")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <Input id="email" type="email" {...form.register("email")} />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
                  <Input id="telefone" {...form.register("telefone")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="celular">Celular</FieldLabel>
                  <Input id="celular" {...form.register("celular")} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
                <Input id="endereco" {...form.register("endereco")} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="bairro">Bairro</FieldLabel>
                  <Input id="bairro" {...form.register("bairro")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cep">CEP</FieldLabel>
                  <Input id="cep" {...form.register("cep")} />
                </Field>
              </div>

              <div className="grid grid-cols-[1fr_5rem] gap-3">
                <Field>
                  <FieldLabel htmlFor="municipio">Município</FieldLabel>
                  <Input id="municipio" {...form.register("municipio")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="uf">UF</FieldLabel>
                  <Input id="uf" maxLength={2} {...form.register("uf")} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Cliente ativo
              </label>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button type="submit" form="cliente-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
