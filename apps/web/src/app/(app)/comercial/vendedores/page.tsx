"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  cargoSchema,
  colaboradorCreateSchema,
  colaboradorUpdateSchema,
  type Cargo,
  type Colaborador,
  type ColaboradorCreate,
  type ColaboradorUpdate,
  type Usuario,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const CARGO_LABEL: Record<Cargo, string> = {
  diretor: "Diretor",
  gerente: "Gerente",
  supervisor: "Supervisor",
  vendedor: "Vendedor",
};

interface ColaboradorRow extends Colaborador {
  usuario: { id: string; nome: string; email: string };
  superior: { usuario: { nome: string } } | null;
}

export default function VendedoresPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<ColaboradorRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<ColaboradorRow>("colaboradores", {
    search,
    page,
    pageSize,
  });

  const { data: usuarios } = useQuery({
    queryKey: ["usuarios", "select"],
    queryFn: () => apiFetch<{ data: Usuario[] }>("/usuarios", { query: { pageSize: 100 } }),
  });

  const { data: colaboradoresParaSuperior } = useQuery({
    queryKey: ["colaboradores", "select"],
    queryFn: () => apiFetch<{ data: ColaboradorRow[] }>("/colaboradores", { query: { pageSize: 100 } }),
  });

  const { create, update, remove } = useResourceMutations<ColaboradorCreate, ColaboradorUpdate>(
    "colaboradores",
  );

  const schema = editing ? colaboradorUpdateSchema : colaboradorCreateSchema;
  const form = useForm<ColaboradorCreate>({
    resolver: zodResolver(schema as typeof colaboradorCreateSchema),
    defaultValues: {
      usuarioId: "",
      superiorId: null,
      cargo: "vendedor",
      codigoErp: "",
      nomeReduzido: "",
      ativo: true,
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      usuarioId: "",
      superiorId: null,
      cargo: "vendedor",
      codigoErp: "",
      nomeReduzido: "",
      ativo: true,
    });
    setSheetOpen(true);
  };

  const openEdit = (colaborador: ColaboradorRow) => {
    setEditing(colaborador);
    form.reset({
      usuarioId: colaborador.usuarioId,
      superiorId: colaborador.superiorId,
      cargo: colaborador.cargo,
      codigoErp: colaborador.codigoErp ?? "",
      nomeReduzido: colaborador.nomeReduzido ?? "",
      ativo: colaborador.ativo,
    });
    setSheetOpen(true);
  };

  const onSubmit = async (values: ColaboradorCreate) => {
    try {
      if (editing) {
        const { superiorId, cargo, codigoErp, nomeReduzido, ativo } = values;
        await update.mutateAsync({
          id: editing.id,
          input: { superiorId, cargo, codigoErp, nomeReduzido, ativo },
        });
        toast.success("Vendedor atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Vendedor cadastrado");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar vendedor");
    }
  };

  const onDelete = async (colaborador: ColaboradorRow) => {
    if (!confirm(`Excluir o vendedor "${colaborador.usuario.nome}"?`)) return;
    try {
      await remove.mutateAsync(colaborador.id);
      toast.success("Vendedor excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir vendedor");
    }
  };

  const columns: ColumnDef<ColaboradorRow>[] = [
    { header: "Código ERP", cell: (c) => <span className="font-mono text-xs">{c.codigoErp ?? "—"}</span> },
    {
      header: "Nome",
      cell: (c) => (
        <div>
          <p className="font-medium">{c.nomeReduzido || c.usuario.nome}</p>
          {c.nomeReduzido && <p className="text-xs text-muted-foreground">{c.usuario.nome}</p>}
        </div>
      ),
    },
    { header: "E-mail", cell: (c) => c.usuario.email },
    { header: "Cargo", cell: (c) => <Badge variant="outline">{CARGO_LABEL[c.cargo]}</Badge> },
    { header: "Superior", cell: (c) => c.superior?.usuario.nome ?? "—" },
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
        createLabel="Novo vendedor"
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
        emptyMessage="Nenhum vendedor cadastrado ainda."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar vendedor" : "Novo vendedor"}</SheetTitle>
          </SheetHeader>

          <form
            id="colaborador-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex-1 overflow-y-auto px-4"
          >
            <FieldGroup>
              {!editing && (
                <Field data-invalid={!!form.formState.errors.usuarioId}>
                  <FieldLabel htmlFor="usuarioId">Usuário</FieldLabel>
                  <Select
                    value={form.watch("usuarioId")}
                    onValueChange={(v) => form.setValue("usuarioId", v, { shouldValidate: true })}
                  >
                    <SelectTrigger id="usuarioId" className="w-full">
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios?.data.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[form.formState.errors.usuarioId]} />
                </Field>
              )}

              <Field data-invalid={!!form.formState.errors.cargo}>
                <FieldLabel htmlFor="cargo">Cargo</FieldLabel>
                <Select
                  value={form.watch("cargo")}
                  onValueChange={(v) => form.setValue("cargo", v as Cargo, { shouldValidate: true })}
                >
                  <SelectTrigger id="cargo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cargoSchema.options.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CARGO_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[form.formState.errors.cargo]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="superiorId">Superior direto (opcional)</FieldLabel>
                <Select
                  value={form.watch("superiorId") ?? "none"}
                  onValueChange={(v) =>
                    form.setValue("superiorId", v === "none" ? null : v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="superiorId" className="w-full">
                    <SelectValue placeholder="Sem superior" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem superior</SelectItem>
                    {colaboradoresParaSuperior?.data
                      .filter((c) => c.id !== editing?.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.usuario.nome} — {CARGO_LABEL[c.cargo]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field data-invalid={!!form.formState.errors.nomeReduzido}>
                <FieldLabel htmlFor="nomeReduzido">Nome reduzido (opcional)</FieldLabel>
                <Input id="nomeReduzido" placeholder="Ex.: CARLOS" {...form.register("nomeReduzido")} />
                <FieldError errors={[form.formState.errors.nomeReduzido]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.codigoErp}>
                <FieldLabel htmlFor="codigoErp">Código ERP (opcional)</FieldLabel>
                <Input id="codigoErp" placeholder="Ex.: 000315" {...form.register("codigoErp")} />
                <FieldError errors={[form.formState.errors.codigoErp]} />
              </Field>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="colaborador-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
