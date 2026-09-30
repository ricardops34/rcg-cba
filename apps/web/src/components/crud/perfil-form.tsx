"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { perfilCreateSchema, type Perfil, type PerfilCreate } from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ModuloComMenus } from "@/hooks/use-menu";
import { PermissoesMatrix } from "@/components/crud/permissoes-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Lock } from "lucide-react";

const LIST_ROUTE = "/admin/perfis";

type PerfilTab = "dados" | "permissoes";

export function PerfilForm({ perfil, initialTab = "dados" }: { perfil?: Perfil; initialTab?: PerfilTab }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PerfilTab>(initialTab);
  const { create, update } = useResourceMutations<PerfilCreate, Partial<PerfilCreate>>("perfis");
  const administradorPlataforma = useAuthStore((s) => s.user?.administradorPlataforma === true);
  // Perfil da plataforma vale para todas as empresas: só o administrador da
  // plataforma altera (a API recusa os demais). O da empresa cria o seu.
  const somenteLeitura = !!perfil && perfil.grupoEconomicoId === null && !administradorPlataforma;

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
          carteiraCompleta: perfil.carteiraCompleta ?? false,
        }
      : { nome: "", descricao: "", ativo: true, rotinaInicialId: null, carteiraCompleta: false },
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

      {somenteLeitura && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            Este é um perfil da plataforma e vale para todas as empresas, por isso fica só para
            consulta. Para ajustar permissões, crie um perfil do seu grupo em{" "}
            <strong>Novo perfil</strong>.
          </p>
        </div>
      )}

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
              <fieldset disabled={somenteLeitura} className="contents">
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

                    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3">
                      <div className="space-y-0.5">
                        <FieldLabel htmlFor="carteiraCompleta" className="text-sm font-medium">
                          Carteira completa
                        </FieldLabel>
                        <FieldDescription className="text-xs">
                          Vê os clientes de todos os vendedores. Desligado, o usuário vê só a carteira do
                          vendedor ligado a ele e a do time abaixo — e, sem vendedor ligado, nenhuma.
                        </FieldDescription>
                      </div>
                      <Switch
                        id="carteiraCompleta"
                        checked={form.watch("carteiraCompleta") ?? false}
                        onCheckedChange={(v) => form.setValue("carteiraCompleta", v, { shouldDirty: true })}
                      />
                    </div>
                  </FieldGroup>
                </CardContent>
              </fieldset>

              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
                  Cancelar
                </Button>
                {!somenteLeitura && (
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {perfil ? "Salvar alterações" : "Cadastrar e continuar"}
                  </Button>
                )}
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="permissoes">
          {perfil && (
            <Card>
              <CardContent>
                <PermissoesMatrix perfilId={perfil.id} somenteLeitura={somenteLeitura} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
