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

export default function ColaboradoresPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ColaboradorRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useResourceList<ColaboradorRow>("colaboradores", {
    search,
    page,
    pageSize: 10,
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
    defaultValues: { usuarioId: "", superiorId: null, cargo: "vendedor", matricula: "", ativo: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ usuarioId: "", superiorId: null, cargo: "vendedor", matricula: "", ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (colaborador: ColaboradorRow) => {
    setEditing(colaborador);
    form.reset({
      usuarioId: colaborador.usuarioId,
      superiorId: colaborador.superiorId,
      cargo: colaborador.cargo,
      matricula: colaborador.matricula ?? "",
      ativo: colaborador.ativo,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: ColaboradorCreate) => {
    try {
      if (editing) {
        const { superiorId, cargo, matricula, ativo } = values;
        await update.mutateAsync({ id: editing.id, input: { superiorId, cargo, matricula, ativo } });
        toast.success("Colaborador atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Colaborador cadastrado");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar colaborador");
    }
  };

  const onDelete = async (colaborador: ColaboradorRow) => {
    if (!confirm(`Excluir o colaborador "${colaborador.usuario.nome}"?`)) return;
    try {
      await remove.mutateAsync(colaborador.id);
      toast.success("Colaborador excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir colaborador");
    }
  };

  const columns: ColumnDef<ColaboradorRow>[] = [
    { header: "Nome", cell: (c) => <span className="font-medium">{c.usuario.nome}</span> },
    { header: "E-mail", cell: (c) => c.usuario.email },
    { header: "Cargo", cell: (c) => <Badge variant="outline">{CARGO_LABEL[c.cargo]}</Badge> },
    { header: "Superior", cell: (c) => c.superior?.usuario.nome ?? "—" },
    { header: "Matrícula", cell: (c) => c.matricula ?? "—" },
    {
      header: "Status",
      cell: (c) => (
        <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
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
        title="Colaboradores"
        description="Vendedores e hierarquia comercial (diretor → gerente → supervisor → vendedor)."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel="Novo colaborador"
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        emptyMessage="Nenhum colaborador cadastrado ainda."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
            </DialogHeader>

            <FieldGroup className="py-4">
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

              <Field data-invalid={!!form.formState.errors.matricula}>
                <FieldLabel htmlFor="matricula">Matrícula (opcional)</FieldLabel>
                <Input id="matricula" {...form.register("matricula")} />
                <FieldError errors={[form.formState.errors.matricula]} />
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
