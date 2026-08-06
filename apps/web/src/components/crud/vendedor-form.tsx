"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  vendedorCreateSchema,
  vendedorUpdateSchema,
  type Vendedor,
  type VendedorCreate,
  type VendedorUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, UserPlus } from "lucide-react";

const LIST_ROUTE = "/gerencial/vendedores";

interface UsuarioOption {
  id: string;
  nome: string;
}

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));

export function VendedorForm({ vendedor }: { vendedor?: Vendedor }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { create, update } = useResourceMutations<VendedorCreate, VendedorUpdate>("vendedores");

  const criarUsuario = useMutation({
    mutationFn: () => apiFetch(`/vendedores/${vendedor?.id}/criar-usuario`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Usuário criado — senha provisória enviada por e-mail");
      queryClient.invalidateQueries({ queryKey: ["vendedores"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
  });

  const onCriarUsuario = () => {
    if (!vendedor) return;
    if (!confirm(`Criar usuário de acesso para "${vendedor.nome}" e enviar senha provisória para ${vendedor.email}?`)) {
      return;
    }
    criarUsuario.mutate(undefined, {
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Erro ao criar usuário");
      },
    });
  };

  const vendedoresSelectQuery = useQuery({
    queryKey: ["vendedores", "select"],
    queryFn: () => apiFetch<{ data: Vendedor[] }>("/vendedores", { query: { pageSize: 100 } }),
  });
  const usuariosSelectQuery = useQuery({
    queryKey: ["usuarios", "select"],
    queryFn: () => apiFetch<{ data: UsuarioOption[] }>("/usuarios", { query: { pageSize: 100 } }),
  });

  // Só lista quem já tem o papel marcado e está ativo — mas mantém o valor
  // atualmente salvo na lista mesmo que o papel tenha sido desmarcado ou o
  // vendedor bloqueado depois, senão o Select mostra um valor "fantasma" ao
  // editar.
  const opcoesSupervisor = (vendedoresSelectQuery.data?.data ?? []).filter(
    (v) => v.id !== vendedor?.id && (v.id === vendedor?.supervisorId || (v.supervisor && v.ativo)),
  );
  const opcoesGerente = (vendedoresSelectQuery.data?.data ?? []).filter(
    (v) => v.id !== vendedor?.id && (v.id === vendedor?.gerenteId || (v.gerente && v.ativo)),
  );
  const opcoesUsuario = usuariosSelectQuery.data?.data ?? [];

  const schema = vendedor ? vendedorUpdateSchema : vendedorCreateSchema;
  const empty: VendedorCreate = {
    codigoErp: "",
    nome: "",
    nomeReduzido: "",
    telefone: "",
    email: "",
    dataNascimento: null,
    usuarioId: null,
    vendedor: true,
    supervisorId: null,
    supervisor: false,
    gerenteId: null,
    gerente: false,
    ativo: true,
    desligado: false,
  };
  const form = useForm<VendedorCreate>({
    resolver: zodResolver(schema as typeof vendedorCreateSchema),
    defaultValues: vendedor
      ? {
          codigoErp: vendedor.codigoErp ?? "",
          nome: vendedor.nome,
          nomeReduzido: vendedor.nomeReduzido ?? "",
          telefone: vendedor.telefone ?? "",
          email: vendedor.email ?? "",
          dataNascimento: vendedor.dataNascimento ?? null,
          usuarioId: vendedor.usuarioId ?? null,
          vendedor: vendedor.vendedor,
          supervisorId: vendedor.supervisorId ?? null,
          supervisor: vendedor.supervisor,
          gerenteId: vendedor.gerenteId ?? null,
          gerente: vendedor.gerente,
          ativo: vendedor.ativo,
          desligado: vendedor.desligado,
        }
      : empty,
  });

  const onSubmit = async (values: VendedorCreate) => {
    try {
      if (vendedor) {
        await update.mutateAsync({ id: vendedor.id, input: values });
        toast.success("Vendedor atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Vendedor cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar vendedor");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {vendedor ? "Editar vendedor" : "Novo vendedor"}
        </h1>
      </div>

      <Card>
        <form id="vendedor-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.nome}>
                  <FieldLabel htmlFor="nome">Nome</FieldLabel>
                  <Input id="nome" {...form.register("nome")} />
                  <FieldError errors={[form.formState.errors.nome]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="nomeReduzido">Nome reduzido</FieldLabel>
                  <Input id="nomeReduzido" {...form.register("nomeReduzido")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.dataNascimento}>
                  <FieldLabel htmlFor="dataNascimento">Data de nascimento</FieldLabel>
                  <Input
                    id="dataNascimento"
                    type="date"
                    defaultValue={dateToInput(form.getValues("dataNascimento"))}
                    onChange={(e) => form.setValue("dataNascimento", inputToDate(e.target.value))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
                  <Input id="telefone" {...form.register("telefone")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <Input id="email" {...form.register("email")} />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="usuarioId">Usuário do sistema (opcional)</FieldLabel>
                <Select
                  value={form.watch("usuarioId") ?? "none"}
                  onValueChange={(val) => form.setValue("usuarioId", val === "none" ? null : val)}
                >
                  <SelectTrigger id="usuarioId" className="w-full">
                    <SelectValue placeholder="Sem vínculo de login" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo de login</SelectItem>
                    {opcoesUsuario.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendedor && !vendedor.usuarioId && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!vendedor.email || criarUsuario.isPending}
                      onClick={onCriarUsuario}
                    >
                      <UserPlus className="size-4" />
                      Criar usuário
                    </Button>
                    {!vendedor.email && (
                      <FieldDescription>
                        Cadastre um e-mail para o vendedor antes de criar o usuário.
                      </FieldDescription>
                    )}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="supervisorId">Supervisor</FieldLabel>
                  <Select
                    value={form.watch("supervisorId") ?? "none"}
                    onValueChange={(val) => form.setValue("supervisorId", val === "none" ? null : val)}
                  >
                    <SelectTrigger id="supervisorId" className="w-full">
                      <SelectValue placeholder="Sem supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem supervisor</SelectItem>
                      {opcoesSupervisor.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nomeReduzido || v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="gerenteId">Gerente</FieldLabel>
                  <Select
                    value={form.watch("gerenteId") ?? "none"}
                    onValueChange={(val) => form.setValue("gerenteId", val === "none" ? null : val)}
                  >
                    <SelectTrigger id="gerenteId" className="w-full">
                      <SelectValue placeholder="Sem gerente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem gerente</SelectItem>
                      {opcoesGerente.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nomeReduzido || v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("vendedor")}
                    onCheckedChange={(v) => form.setValue("vendedor", v === true)}
                  />
                  É vendedor
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("supervisor")}
                    onCheckedChange={(v) => form.setValue("supervisor", v === true)}
                  />
                  É supervisor
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("gerente")}
                    onCheckedChange={(v) => form.setValue("gerente", v === true)}
                  />
                  É gerente
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("desligado")}
                    onCheckedChange={(v) => form.setValue("desligado", v === true)}
                  />
                  Desligado
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Usa em Dashboard
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {vendedor ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
