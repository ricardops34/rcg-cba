"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { perfilCreateSchema, type Perfil, type PerfilCreate } from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { PermissoesMatrix } from "@/components/crud/permissoes-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/admin/perfis";

type PerfilTab = "dados" | "permissoes";

export function PerfilForm({ perfil, initialTab = "dados" }: { perfil?: Perfil; initialTab?: PerfilTab }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PerfilTab>(initialTab);
  const { create, update } = useResourceMutations<PerfilCreate, Partial<PerfilCreate>>("perfis");

  const form = useForm<PerfilCreate>({
    resolver: zodResolver(perfilCreateSchema),
    defaultValues: perfil
      ? { nome: perfil.nome, descricao: perfil.descricao ?? "", ativo: perfil.ativo }
      : { nome: "", descricao: "", ativo: true },
  });

  const onSubmit = async (values: PerfilCreate) => {
    try {
      if (perfil) {
        await update.mutateAsync({ id: perfil.id, input: values });
        toast.success("Perfil atualizado");
        router.push(LIST_ROUTE);
      } else {
        const criado = (await create.mutateAsync(values)) as Perfil;
        toast.success("Perfil cadastrado — configure as permissões a seguir");
        router.push(`/admin/perfis/${criado.id}?tab=permissoes`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar perfil");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {perfil ? `Perfil — ${perfil.nome}` : "Novo perfil"}
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PerfilTab)}>
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="permissoes" disabled={!perfil}>
            Permissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <form id="perfil-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <CardContent>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  </div>
                </FieldGroup>
              </CardContent>

              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {perfil ? "Salvar alterações" : "Cadastrar e continuar"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="permissoes">
          {perfil && (
            <Card>
              <CardContent>
                <PermissoesMatrix perfilId={perfil.id} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
