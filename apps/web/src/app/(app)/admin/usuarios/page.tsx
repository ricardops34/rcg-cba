"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  usuarioCreateSchema,
  usuarioUpdateSchema,
  type Perfil,
  type Usuario,
  type UsuarioCreate,
  type UsuarioUpdate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function UsuariosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useResourceList<Usuario>("usuarios", { search, page, pageSize: 10 });
  const { data: perfis } = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const { create, update, remove } = useResourceMutations<UsuarioCreate, UsuarioUpdate>("usuarios");

  const schema = editing ? usuarioUpdateSchema : usuarioCreateSchema;
  const form = useForm<UsuarioCreate>({
    resolver: zodResolver(schema as typeof usuarioCreateSchema),
    defaultValues: { nome: "", email: "", senha: "", ativo: true, perfilId: "" },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ nome: "", email: "", senha: "", ativo: true, perfilId: perfis?.data[0]?.id ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (usuario: Usuario) => {
    setEditing(usuario);
    form.reset({ nome: usuario.nome, email: usuario.email, senha: "", ativo: usuario.ativo, perfilId: "" });
    setDialogOpen(true);
  };

  const onSubmit = async (values: UsuarioCreate) => {
    try {
      if (editing) {
        const { nome, email, ativo } = values;
        await update.mutateAsync({ id: editing.id, input: { nome, email, ativo } });
        toast.success("Usuário atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Usuário cadastrado");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar usuário");
    }
  };

  const onDelete = async (usuario: Usuario) => {
    if (!confirm(`Excluir o usuário "${usuario.nome}"?`)) return;
    try {
      await remove.mutateAsync(usuario.id);
      toast.success("Usuário excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir usuário");
    }
  };

  const columns: ColumnDef<Usuario>[] = [
    { header: "Nome", cell: (u) => <span className="font-medium">{u.nome}</span> },
    { header: "E-mail", cell: (u) => u.email },
    {
      header: "Status",
      cell: (u) => (
        <Badge variant={u.ativo ? "success" : "secondary"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(u)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(u)}>
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
        title="Usuários"
        description="Contas de acesso da empresa ativa."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel="Novo usuário"
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(u) => u.id}
        isLoading={isLoading}
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            </DialogHeader>

            <FieldGroup className="py-4">
              <Field data-invalid={!!form.formState.errors.nome}>
                <FieldLabel htmlFor="nome">Nome</FieldLabel>
                <Input id="nome" {...form.register("nome")} />
                <FieldError errors={[form.formState.errors.nome]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input id="email" type="email" {...form.register("email")} />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              {!editing && (
                <>
                  <Field data-invalid={!!form.formState.errors.senha}>
                    <FieldLabel htmlFor="senha">Senha inicial</FieldLabel>
                    <Input id="senha" type="password" {...form.register("senha")} />
                    <FieldError errors={[form.formState.errors.senha]} />
                  </Field>

                  <Field data-invalid={!!form.formState.errors.perfilId}>
                    <FieldLabel htmlFor="perfilId">Perfil</FieldLabel>
                    <Select
                      value={form.watch("perfilId")}
                      onValueChange={(v) => form.setValue("perfilId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger id="perfilId" className="w-full">
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {perfis?.data.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[form.formState.errors.perfilId]} />
                  </Field>
                </>
              )}
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
