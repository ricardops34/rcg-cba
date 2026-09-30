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
import { UsuarioEmpresasGrupo } from "@/components/crud/usuario-empresas-grupo";
import { UsuarioDadosGrupo } from "@/components/crud/usuario-dados-grupo";
import { UsuarioResetSenhaSection } from "@/components/crud/usuario-reset-senha-section";
import { UsuarioHorariosSection } from "@/components/crud/usuario-horarios-section";
import { UsuarioTelaInicial } from "@/components/crud/usuario-tela-inicial";
import { ProfilePhoto } from "@/components/perfil/profile-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/admin/usuarios";

/**
 * Cadastro do usuário. É a mesma pessoa de "Meu perfil" (a mesma tabela), vista
 * por quem administra. O usuário é um só no grupo econômico: perfil, empresas e
 * dados valem para todas as empresas do grupo a que ele tem acesso.
 *
 * Novo usuário (só pela Plataforma — o administrador de um grupo usa
 * "Novo usuário do grupo") fica num formulário simples; a edição é em abas.
 */
export function UsuarioForm({ usuario }: { usuario?: Usuario }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<UsuarioCreate, UsuarioUpdate>("usuarios");
  const { data: perfis } = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
    enabled: !usuario,
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
      } else {
        await create.mutateAsync(values);
        toast.success("Usuário cadastrado com sucesso");
        router.push(LIST_ROUTE);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar usuário");
    }
  };

  const dadosGerais = (
    <form id="usuario-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <CardContent className="space-y-4 pt-6">
        <FieldGroup>
          {usuario && <ProfilePhoto user={usuario} usuarioId={usuario.id} />}

          <Field data-invalid={!!form.formState.errors.nome}>
            <FieldLabel htmlFor="nome">Nome apresentado</FieldLabel>
            <Input id="nome" placeholder="ex.: João da Silva" {...form.register("nome")} />
            <FieldDescription>Identifica o usuário no atendimento e assina as mensagens enviadas ao cliente.</FieldDescription>
            <FieldError errors={[form.formState.errors.nome]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.email}>
            <FieldLabel htmlFor="email">E-mail de login</FieldLabel>
            <Input id="email" type="email" placeholder="joao@empresa.com.br" {...form.register("email")} />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>

          {usuario && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
              <div className="space-y-0.5">
                <FieldLabel htmlFor="ativo" className="text-sm font-medium">Usuário ativo</FieldLabel>
                <FieldDescription className="text-xs">Usuários inativos têm o acesso bloqueado ao sistema.</FieldDescription>
              </div>
              <Switch
                id="ativo"
                checked={form.watch("ativo")}
                onCheckedChange={(checked) => form.setValue("ativo", checked, { shouldDirty: true })}
              />
            </div>
          )}

          {!usuario && (
            <>
              <Field data-invalid={!!form.formState.errors.senha}>
                <FieldLabel htmlFor="senha">Senha inicial de acesso</FieldLabel>
                <PasswordInput id="senha" {...form.register("senha")} />
                {politica && <FieldDescription>{describeRequisitos(politica).join(" · ")}</FieldDescription>}
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
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
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
          {usuario ? "Voltar" : "Cancelar"}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {usuario ? "Salvar" : "Cadastrar usuário"}
        </Button>
      </CardFooter>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push(LIST_ROUTE)} className="size-9 shadow-xs">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">{usuario ? usuario.nome : "Novo usuário"}</h1>
      </div>

      {!usuario ? (
        <Card className="max-w-2xl">{dadosGerais}</Card>
      ) : (
        <Tabs defaultValue="dados" className="max-w-3xl">
          <TabsList className="flex-wrap">
            <TabsTrigger value="dados">Dados gerais</TabsTrigger>
            <TabsTrigger value="empresas">Empresas e perfil</TabsTrigger>
            <TabsTrigger value="acesso">Acesso ao sistema</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <Card>{dadosGerais}</Card>
            <Card><CardContent className="pt-6"><UsuarioDadosGrupo usuarioId={usuario.id} /></CardContent></Card>
            <Card><CardContent className="pt-6"><UsuarioTelaInicial usuarioId={usuario.id} /></CardContent></Card>
          </TabsContent>

          <TabsContent value="empresas">
            <Card><CardContent className="pt-6"><UsuarioEmpresasGrupo usuarioId={usuario.id} /></CardContent></Card>
          </TabsContent>

          <TabsContent value="acesso">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <UsuarioResetSenhaSection usuarioId={usuario.id} />
                <UsuarioHorariosSection usuarioId={usuario.id} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
