"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { perfilCreateSchema, type Perfil, type PerfilCreate } from "@plataforma/contracts";
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

export default function PerfisPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Perfil | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useResourceList<Perfil>("perfis", { search, page, pageSize: 10 });
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
    setDialogOpen(true);
  };

  const openEdit = (perfil: Perfil) => {
    setEditing(perfil);
    form.reset({ nome: perfil.nome, descricao: perfil.descricao ?? "", ativo: perfil.ativo });
    setDialogOpen(true);
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
      setDialogOpen(false);
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
          <span className="font-medium">{p.nome}</span>
          {p.sistemaBase && <Badge variant="outline">Base do sistema</Badge>}
        </div>
      ),
    },
    { header: "Descrição", cell: (p) => p.descricao ?? "—" },
    {
      header: "Status",
      cell: (p) => (
        <Badge variant={p.ativo ? "success" : "secondary"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
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
        title="Perfis"
        description="Papéis (RBAC) da empresa ativa. A definição de permissões por rotina será feita na tela de detalhe do perfil."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel="Novo perfil"
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(p) => p.id}
        isLoading={isLoading}
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar perfil" : "Novo perfil"}</DialogTitle>
            </DialogHeader>

            <FieldGroup className="py-4">
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
