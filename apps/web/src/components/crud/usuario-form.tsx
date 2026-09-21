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
  type PoliticaSenha,
  type Usuario,
  type UsuarioCreate,
  type UsuarioUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buildSenhaSchema, describeRequisitos } from "@/lib/politica-senha";
import { UsuarioEmpresasSection } from "@/components/crud/usuario-empresas-section";
import { UsuarioResetSenhaSection } from "@/components/crud/usuario-reset-senha-section";
import { UsuarioHorariosSection } from "@/components/crud/usuario-horarios-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ArrowLeft, User, UserCheck, UserPlus, Building2 } from "lucide-react";

const LIST_ROUTE = "/admin/usuarios";

export function UsuarioForm({ usuario }: { usuario?: Usuario }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<UsuarioCreate, UsuarioUpdate>("usuarios");
  const { data: perfis } = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const { data: politica } = useQuery({
    queryKey: ["politica-senha", "empresa-ativa"],
    queryFn: () => apiFetch<PoliticaSenha>("/politica-senha/empresa-ativa"),
    enabled: !usuario,
  });

  const schema = usuario
    ? usuarioUpdateSchema
    : politica
      ? usuarioCreateSchema.extend({ senha: buildSenhaSchema(politica) })
      : usuarioCreateSchema;

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
        toast.success("Usuário atualizado com sucesso");
        router.push(LIST_ROUTE);
      } else {
        await create.mutateAsync(values);
        toast.success("Usuário cadastrado com sucesso");
        router.push(LIST_ROUTE);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar usuário");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push(LIST_ROUTE)}
          className="size-9 shadow-xs"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {usuario ? `Editar: ${usuario.nome}` : "Novo Usuário"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {usuario
              ? "Atualize o cadastro, status, empresas vinculadas e permissões do usuário."
              : "Cadastre um novo usuário com perfil inicial e credenciais de acesso."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-xs border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="size-4 text-primary" /> Dados Gerais do Usuário
            </CardTitle>
          </CardHeader>
          <form id="usuario-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.nome}>
                  <FieldLabel htmlFor="nome">Nome completo</FieldLabel>
                  <Input id="nome" placeholder="ex.: João da Silva" {...form.register("nome")} />
                  <FieldError errors={[form.formState.errors.nome]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail de login</FieldLabel>
                  <Input id="email" type="email" placeholder="joao@empresa.com.br" {...form.register("email")} />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>

                {usuario && (
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                    <div className="space-y-0.5">
                      <FieldLabel htmlFor="ativo" className="text-sm font-medium">Status do Usuário</FieldLabel>
                      <FieldDescription className="text-xs">
                        Usuários inativos têm o acesso bloqueado ao sistema.
                      </FieldDescription>
                    </div>
                    <Switch
                      id="ativo"
                      checked={form.watch("ativo")}
                      onCheckedChange={(checked) => form.setValue("ativo", checked)}
                    />
                  </div>
                )}

                {usuario && <UsuarioResetSenhaSection usuarioId={usuario.id} />}

                {usuario && <UsuarioHorariosSection usuarioId={usuario.id} />}

                {!usuario && (
                  <>
                    <Field data-invalid={!!form.formState.errors.senha}>
                      <FieldLabel htmlFor="senha">Senha inicial de acesso</FieldLabel>
                      <PasswordInput id="senha" {...form.register("senha")} />
                      {politica && (
                        <FieldDescription>{describeRequisitos(politica).join(" · ")}</FieldDescription>
                      )}
                      <FieldError errors={[form.formState.errors.senha]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.perfilId}>
                      <FieldLabel htmlFor="perfilId">Perfil inicial de acesso</FieldLabel>
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

            <CardFooter className="justify-end gap-3 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="shadow-xs gap-2">
                {usuario ? "Salvar alterações" : "Cadastrar Usuário"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {usuario && (
          <Card className="shadow-xs border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="size-4 text-primary" /> Vínculo de Empresas e Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UsuarioEmpresasSection usuarioId={usuario.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

