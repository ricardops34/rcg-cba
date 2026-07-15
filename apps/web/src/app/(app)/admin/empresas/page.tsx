"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  empresaCreateSchema,
  type CurrentUser,
  type Empresa,
  type EmpresaCreate,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
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
import { ImageIcon, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";

export default function EmpresasPage() {
  const setUser = useAuthStore((state) => state.setUser);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching, refetch } = useResourceList<Empresa>("empresas", {
    search,
    page,
    pageSize,
  });
  const { create, update, remove } = useResourceMutations<EmpresaCreate, Partial<EmpresaCreate>>(
    "empresas",
  );

  const form = useForm<EmpresaCreate>({
    resolver: zodResolver(empresaCreateSchema),
    defaultValues: { razaoSocial: "", nomeFantasia: "", cnpj: "", alias: null, ativo: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ razaoSocial: "", nomeFantasia: "", cnpj: "", alias: null, ativo: true });
    setSheetOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditing(empresa);
    form.reset({
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      alias: empresa.alias ?? null,
      ativo: empresa.ativo,
    });
    setSheetOpen(true);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editing) return;
    setUploadingLogo(true);
    try {
      const updated = await apiUpload<Empresa>(`/empresas/${editing.id}/logo`, file);
      setEditing(updated);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      toast.success("Logo atualizado");
      refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
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
      setSheetOpen(false);
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

  const formatCnpj = (cnpj: string) =>
    cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

  const columns: ColumnDef<Empresa>[] = [
    { header: "Nome fantasia", cell: (e) => <span className="font-medium">{e.nomeFantasia}</span> },
    { header: "Razão social", cell: (e) => e.razaoSocial },
    { header: "CNPJ", cell: (e) => <span className="font-mono text-xs">{formatCnpj(e.cnpj)}</span> },
    { header: "Status", cell: (e) => <StatusDot active={e.ativo} labelOn="Ativa" labelOff="Inativa" /> },
    {
      header: "",
      className: "w-10",
      cell: (e) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
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
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={openCreate}
        createLabel="Nova empresa"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
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
            <SheetTitle>{editing ? "Editar empresa" : "Nova empresa"}</SheetTitle>
          </SheetHeader>

          <form
            id="empresa-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex-1 overflow-y-auto px-4"
          >
            <FieldGroup>
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

              <Field data-invalid={!!form.formState.errors.alias}>
                <FieldLabel htmlFor="alias">Alias (URL de login)</FieldLabel>
                <Input
                  id="alias"
                  placeholder="ex.: rcg"
                  maxLength={40}
                  {...form.register("alias", {
                    setValueAs: (v) => (v?.trim() ? v.trim().toLowerCase() : null),
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Usado em <span className="font-mono">/login?empresa=&lt;alias&gt;</span>. Apenas
                  letras minúsculas, números e hífen.
                </p>
                <FieldError errors={[form.formState.errors.alias]} />
              </Field>

              {editing && (
                <Field>
                  <FieldLabel>Logo</FieldLabel>
                  <div className="flex items-center gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40">
                      {editing.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(editing.logoUrl) ?? ""}
                          alt="Logo da empresa"
                          className="size-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="size-4" />
                        {uploadingLogo ? "Enviando..." : "Enviar logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground">PNG, JPEG, WEBP ou SVG (até 2 MB).</p>
                    </div>
                  </div>
                </Field>
              )}
            </FieldGroup>
          </form>

          <SheetFooter className="flex-row justify-end border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="empresa-form" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
