"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { perfilCreateSchema, type Perfil, type PerfilCreate } from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModuloComMenus } from "@/hooks/use-menu";
import { PermissoesMatrix } from "@/components/crud/permissoes-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/admin/perfis";

type PerfilTab = "dados" | "permissoes";

export function PerfilForm({ perfil, initialTab = "dados" }: { perfil?: Perfil; initialTab?: PerfilTab }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PerfilTab>(initialTab);
  const { create, update } = useResourceMutations<PerfilCreate, Partial<PerfilCreate>>("perfis");

  const { data: modulos } = useQuery({
    queryKey: ["modulos", "all"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
  });

  const todasRotinas = useMemo(() => {
    if (!modulos) return [];
    const list: { id: string; nome: string; menuNome: string; moduloNome: string }[] = [];
    for (const modulo of modulos) {
      for (const menu of modulo.menus) {
        if (menu.submenus && menu.submenus.length > 0) {
          for (const sub of menu.submenus) {
            for (const r of sub.rotinas) {
              list.push({ id: r.id, nome: r.nome, menuNome: sub.nome, moduloNome: modulo.nome });
            }
          }
        }
        for (const r of menu.rotinas) {
          list.push({ id: r.id, nome: r.nome, menuNome: menu.nome, moduloNome: modulo.nome });
        }
      }
    }
    return list;
  }, [modulos]);

  const form = useForm<PerfilCreate>({
    resolver: zodResolver(perfilCreateSchema),
    defaultValues: perfil
      ? {
          nome: perfil.nome,
          descricao: perfil.descricao ?? "",
          ativo: perfil.ativo,
          rotinaInicialId: perfil.rotinaInicialId ?? null,
        }
      : { nome: "", descricao: "", ativo: true, rotinaInicialId: null },
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

  const selectedRotinaInicial = form.watch("rotinaInicialId");

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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                    <Field data-invalid={!!form.formState.errors.rotinaInicialId} className="sm:col-span-2">
                      <FieldLabel htmlFor="rotinaInicialId">Rotina Inicial (Tela Inicial Padrão)</FieldLabel>
                      <Select
                        value={selectedRotinaInicial ?? "none"}
                        onValueChange={(val) =>
                          form.setValue("rotinaInicialId", val === "none" ? null : val, { shouldDirty: true })
                        }
                      >
                        <SelectTrigger id="rotinaInicialId">
                          <SelectValue placeholder="Padrão do Sistema (Mural / Atalhos)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Padrão do Sistema (Mural / Atalhos)</SelectItem>
                          {todasRotinas.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.moduloNome} &gt; {r.menuNome} &gt; {r.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[form.formState.errors.rotinaInicialId]} />
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
