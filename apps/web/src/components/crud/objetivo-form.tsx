"use client";

import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  objetivoVendedorMesCreateSchema,
  objetivoVendedorMesUpdateSchema,
  type Categoria,
  type ObjetivoVendedorMes,
  type ObjetivoVendedorMesCreate,
  type ObjetivoVendedorMesUpdate,
  type Vendedor,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const LIST_ROUTE = "/gerencial/objetivos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function ObjetivoForm({ objetivo }: { objetivo?: ObjetivoVendedorMes }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<ObjetivoVendedorMesCreate, ObjetivoVendedorMesUpdate>(
    "objetivos",
  );

  const vendedoresQuery = useQuery({
    queryKey: ["vendedores", "select"],
    queryFn: () => apiFetch<{ data: Vendedor[] }>("/vendedores", { query: { pageSize: 100 } }),
  });
  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raiz"],
    queryFn: () => apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });
  const opcoesVendedor = vendedoresQuery.data?.data ?? [];
  const opcoesCategoria = categoriasQuery.data?.data ?? [];

  const schema = objetivo ? objetivoVendedorMesUpdateSchema : objetivoVendedorMesCreateSchema;
  const empty: ObjetivoVendedorMesCreate = {
    vendedorId: "",
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    valor: 0,
    numeroCliente: null,
    novoCliente: null,
    tipo: "",
    ativo: true,
    categorias: [],
  };
  const form = useForm<ObjetivoVendedorMesCreate>({
    resolver: zodResolver(schema as typeof objetivoVendedorMesCreateSchema),
    defaultValues: objetivo
      ? {
          vendedorId: objetivo.vendedorId,
          mes: objetivo.mes,
          ano: objetivo.ano,
          valor: objetivo.valor,
          numeroCliente: objetivo.numeroCliente,
          novoCliente: objetivo.novoCliente,
          tipo: objetivo.tipo ?? "",
          ativo: objetivo.ativo,
          categorias: objetivo.categorias.map((c) => ({ categoriaId: c.categoriaId, valor: c.valor })),
        }
      : empty,
  });

  const linhas = useFieldArray({ control: form.control, name: "categorias" });

  const onSubmit = async (values: ObjetivoVendedorMesCreate) => {
    try {
      if (objetivo) {
        await update.mutateAsync({ id: objetivo.id, input: values });
        toast.success("Objetivo atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Objetivo cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar objetivo");
    }
  };

  const categoriasEmUso = new Set(form.watch("categorias").map((c) => c.categoriaId));
  const proximaCategoriaDisponivel = opcoesCategoria.find((c) => !categoriasEmUso.has(c.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {objetivo ? "Editar objetivo" : "Novo objetivo"}
        </h1>
      </div>

      <Card>
        <form id="objetivo-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.vendedorId}>
                <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
                <Select
                  value={form.watch("vendedorId")}
                  onValueChange={(val) => form.setValue("vendedorId", val)}
                >
                  <SelectTrigger id="vendedorId" className="w-full">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesVendedor.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nomeReduzido || v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[form.formState.errors.vendedorId]} />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="mes">Mês</FieldLabel>
                  <Select
                    value={String(form.watch("mes"))}
                    onValueChange={(val) => form.setValue("mes", Number(val))}
                  >
                    <SelectTrigger id="mes" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((nome, i) => (
                        <SelectItem key={nome} value={String(i + 1)}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-invalid={!!form.formState.errors.ano}>
                  <FieldLabel htmlFor="ano">Ano</FieldLabel>
                  <Input id="ano" type="number" inputMode="numeric" {...form.register("ano", { valueAsNumber: true })} />
                  <FieldError errors={[form.formState.errors.ano]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="valor">Valor da meta (R$)</FieldLabel>
                  <Input id="valor" type="number" step="0.01" min={0} {...form.register("valor", { valueAsNumber: true })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="numeroCliente">Nº de clientes (meta)</FieldLabel>
                  <Input
                    id="numeroCliente"
                    type="number"
                    min={0}
                    value={form.watch("numeroCliente") ?? ""}
                    onChange={(e) => form.setValue("numeroCliente", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="novoCliente">Novos clientes (meta)</FieldLabel>
                  <Input
                    id="novoCliente"
                    type="number"
                    min={0}
                    value={form.watch("novoCliente") ?? ""}
                    onChange={(e) => form.setValue("novoCliente", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Ativo
              </label>

              <div className="space-y-2 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between">
                  <FieldLabel>Metas por categoria</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!proximaCategoriaDisponivel}
                    onClick={() =>
                      proximaCategoriaDisponivel &&
                      linhas.append({ categoriaId: proximaCategoriaDisponivel.id, valor: 0 })
                    }
                  >
                    <Plus className="size-3.5" />
                    Adicionar categoria
                  </Button>
                </div>

                {linhas.fields.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma meta por categoria cadastrada.</p>
                )}

                <div className="space-y-1.5">
                  {linhas.fields.map((linha, index) => (
                    <div key={linha.id} className="flex items-center gap-2">
                      <Select
                        value={form.watch(`categorias.${index}.categoriaId`)}
                        onValueChange={(val) => form.setValue(`categorias.${index}.categoriaId`, val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoesCategoria.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.codigoErp} — {c.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-40"
                        placeholder="Valor"
                        {...form.register(`categorias.${index}.valor`, { valueAsNumber: true })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => linhas.remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {objetivo ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
