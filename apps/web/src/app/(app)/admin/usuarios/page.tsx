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
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { UsuarioEmpresasSection } from "@/components/crud/usuario-empresas-section";
import { roleColorClass } from "@/lib/role-color";
import { Separator } from "@/components/ui/separator";
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

interface UsuarioRow extends Usuario {
  perfil: { id: string; nome: string } | null;
}

export default function UsuariosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<UsuarioRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useResourceList<UsuarioRow>("usuarios", {
    search,
    page,
    pageSize,
  });
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
    setSheetOpen(true);
  };

  const openEdit = (usuario: UsuarioRow) => {
    setEditing(usuario);
    form.reset({ nome: usuario.nome, email: usuario.email, senha: "", ativo: usuario.ativo, perfilId: "" });
    setSheetOpen(true);
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
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar usuário");
    }
  };

  const onDelete = async (usuario: UsuarioRow) => {
    if (!confirm(`Excluir o usuário "${usuario.nome}"?`)) return;
    try {
      await remove.mutateAsync(usuario.id);
      toast.success("Usuário excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir usuário");
    }
  };

  const columns: ColumnDef<UsuarioRow>[] = [
    { header: "Nome", cell: (u) => <span className="font-medium">{u.nome}</span> },
    { header: "E-mail", cell: (u) => u.email },
    {
      header: "Perfil",
      cell: (u) =>
        u.perfil ? (
          <Badge className={roleColorClass(u.perfil.nome)} variant="outline">
            {u.perfil.nome}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: "Status", cell: (u) => <StatusDot active={u.ativo} /> },
    {
      header: "Último acesso",
      cell: (u) =>
        u.ultimoLogin ? (
          <span className="text-sm text-muted-foreground">
            {new Date(u.ultimoLogin).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Nunca</span>
        ),
    },
    {
      header: "",
      className: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
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
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={openCreate}
        createLabel="Novo usuário"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(u) => u.id}
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
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar usuário" : "Novo usuário"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4">
            <form id="usuario-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <FieldGroup>
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
            </form>

            {editing && (
              <>
                <Separator />
                <UsuarioEmpresasSection usuarioId={editing.id} />
              </>
            )}
          </div>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="usuario-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
