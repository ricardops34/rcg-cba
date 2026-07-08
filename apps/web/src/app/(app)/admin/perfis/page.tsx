"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { perfilCreateSchema, type Perfil, type PerfilCreate } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { PermissoesMatrix } from "@/components/crud/permissoes-matrix";
import { roleColorClass } from "@/lib/role-color";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, ShieldCheck, Trash2 } from "lucide-react";

export default function PerfisPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<Perfil | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [permissoesFor, setPermissoesFor] = useState<Perfil | null>(null);

  const { data, isLoading, isFetching, refetch } = useResourceList<Perfil>("perfis", {
    search,
    page,
    pageSize,
  });
  const { create, update, remove } = useResourceMutations<PerfilCreate, Partial<PerfilCreate>>(
    "perfis",
  );

  const form = useForm<PerfilCreate>({
    resolver: zodResolver(perfilCreateSchema),
    defaultValues: { nome: "", descricao: "", ativo: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ nome: "", descricao: "", ativo: true });
    setSheetOpen(true);
  };

  const openEdit = (perfil: Perfil) => {
    setEditing(perfil);
    form.reset({ nome: perfil.nome, descricao: perfil.descricao ?? "", ativo: perfil.ativo });
    setSheetOpen(true);
  };

  const onSubmit = async (values: PerfilCreate) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: values });
        toast.success("Perfil atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Perfil cadastrado");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar perfil");
    }
  };

  const onDelete = async (perfil: Perfil) => {
    if (perfil.sistemaBase) {
      toast.error("Perfis base do sistema não podem ser excluídos");
      return;
    }
    if (!confirm(`Excluir o perfil "${perfil.nome}"?`)) return;
    try {
      await remove.mutateAsync(perfil.id);
      toast.success("Perfil excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir perfil");
    }
  };

  const columns: ColumnDef<Perfil>[] = [
    {
      header: "Nome",
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge className={roleColorClass(p.nome)} variant="outline">
            {p.nome}
          </Badge>
          {p.sistemaBase && (
            <span className="text-xs text-muted-foreground">Base do sistema</span>
          )}
        </div>
      ),
    },
    { header: "Descrição", cell: (p) => p.descricao ?? "—" },
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
            <DropdownMenuItem onClick={() => setPermissoesFor(p)}>
              <ShieldCheck className="size-4" /> Permissões
            </DropdownMenuItem>
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
        createLabel="Novo perfil"
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
        onRowClick={(p) => setPermissoesFor(p)}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar perfil" : "Novo perfil"}</SheetTitle>
          </SheetHeader>

          <form
            id="perfil-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex-1 overflow-y-auto px-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.nome}>
                <FieldLabel htmlFor="nome">Nome</FieldLabel>
                <Input id="nome" {...form.register("nome")} />
                <FieldError errors={[form.formState.errors.nome]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.descricao}>
                <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                <Input id="descricao" {...form.register("descricao")} />
                <FieldError errors={[form.formState.errors.descricao]} />
              </Field>
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="perfil-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={!!permissoesFor} onOpenChange={(open) => !open && setPermissoesFor(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Permissões — {permissoesFor?.nome}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {permissoesFor && (
              <PermissoesMatrix
                perfilId={permissoesFor.id}
                onSaved={() => setPermissoesFor(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
