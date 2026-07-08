"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  empresaCreateSchema,
  type Empresa,
  type EmpresaCreate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { DataTable, type ColumnDef } from "@/components/crud/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function EmpresasPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useResourceList<Empresa>("empresas", { search, page, pageSize: 10 });
  const { create, update, remove } = useResourceMutations<EmpresaCreate, Partial<EmpresaCreate>>(
    "empresas",
  );

  const form = useForm<EmpresaCreate>({
    resolver: zodResolver(empresaCreateSchema),
    defaultValues: { razaoSocial: "", nomeFantasia: "", cnpj: "", ativo: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ razaoSocial: "", nomeFantasia: "", cnpj: "", ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditing(empresa);
    form.reset({
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      ativo: empresa.ativo,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: EmpresaCreate) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: values });
        toast.success("Empresa atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Empresa cadastrada");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar empresa");
    }
  };

  const onDelete = async (empresa: Empresa) => {
    if (!confirm(`Excluir a empresa "${empresa.nomeFantasia}"?`)) return;
    try {
      await remove.mutateAsync(empresa.id);
      toast.success("Empresa excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir empresa");
    }
  };

  const columns: ColumnDef<Empresa>[] = [
    { header: "Nome fantasia", cell: (e) => <span className="font-medium">{e.nomeFantasia}</span> },
    { header: "Razão social", cell: (e) => e.razaoSocial },
    { header: "CNPJ", cell: (e) => e.cnpj },
    {
      header: "Status",
      cell: (e) => (
        <Badge variant={e.ativo ? "success" : "secondary"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (e) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(e)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(e)}>
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
        title="Empresas"
        description="Empresas cadastradas no sistema, base do isolamento multiempresa."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel="Nova empresa"
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            </DialogHeader>

            <FieldGroup className="py-4">
              <Field data-invalid={!!form.formState.errors.razaoSocial}>
                <FieldLabel htmlFor="razaoSocial">Razão social</FieldLabel>
                <Input id="razaoSocial" {...form.register("razaoSocial")} />
                <FieldError errors={[form.formState.errors.razaoSocial]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.nomeFantasia}>
                <FieldLabel htmlFor="nomeFantasia">Nome fantasia</FieldLabel>
                <Input id="nomeFantasia" {...form.register("nomeFantasia")} />
                <FieldError errors={[form.formState.errors.nomeFantasia]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.cnpj}>
                <FieldLabel htmlFor="cnpj">CNPJ (somente números)</FieldLabel>
                <Input id="cnpj" maxLength={14} {...form.register("cnpj")} />
                <FieldError errors={[form.formState.errors.cnpj]} />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {editing ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
