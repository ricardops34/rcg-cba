"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  usuarioCreateSchema,
  usuarioUpdateSchema,
  type Perfil,
  type Usuario,
  type UsuarioCreate,
  type UsuarioUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { UsuarioEmpresasSection } from "@/components/crud/usuario-empresas-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/admin/usuarios";

export function UsuarioForm({ usuario }: { usuario?: Usuario }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<UsuarioCreate, UsuarioUpdate>("usuarios");
  const { data: perfis } = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const schema = usuario ? usuarioUpdateSchema : usuarioCreateSchema;
  const form = useForm<UsuarioCreate>({
    resolver: zodResolver(schema as typeof usuarioCreateSchema),
    defaultValues: usuario
      ? { nome: usuario.nome, email: usuario.email, senha: "", ativo: usuario.ativo, perfilId: "" }
      : { nome: "", email: "", senha: "", ativo: true, perfilId: perfis?.data[0]?.id ?? "" },
  });

  const onSubmit = async (values: UsuarioCreate) => {
    try {
      if (usuario) {
        const { nome, email, ativo } = values;
        await update.mutateAsync({ id: usuario.id, input: { nome, email, ativo } });
        toast.success("Usuário atualizado");
        router.push(LIST_ROUTE);
      } else {
        await create.mutateAsync(values);
        toast.success("Usuário cadastrado");
        router.push(LIST_ROUTE);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar usuário");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {usuario ? "Editar usuário" : "Novo usuário"}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <form id="usuario-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <CardContent>
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

                {!usuario && (
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
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {usuario ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {usuario && (
          <Card>
            <CardContent>
              <UsuarioEmpresasSection usuarioId={usuario.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
