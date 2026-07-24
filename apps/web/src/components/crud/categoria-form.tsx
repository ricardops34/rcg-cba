"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  categoriaCreateSchema,
  categoriaUpdateSchema,
  type Categoria,
  type CategoriaCreate,
  type CategoriaUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/categorias";

export function CategoriaForm({ categoria }: { categoria?: Categoria }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<CategoriaCreate, CategoriaUpdate>("categorias");

  // Só categorias raiz podem ser pai (hierarquia limitada a 2 níveis).
  const raizesQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });
  const opcoesPai = (raizesQuery.data?.data ?? []).filter((c) => c.id !== categoria?.id);

  const schema = categoria ? categoriaUpdateSchema : categoriaCreateSchema;
  const empty: CategoriaCreate = {
    codigoErp: "",
    descricao: "",
    categoriaPaiId: null,
    usado: null,
    ativo: true,
  };
  const form = useForm<CategoriaCreate>({
    resolver: zodResolver(schema as typeof categoriaCreateSchema),
    defaultValues: categoria
      ? {
          codigoErp: categoria.codigoErp,
          descricao: categoria.descricao,
          categoriaPaiId: categoria.categoriaPaiId ?? null,
          usado: categoria.usado ?? null,
          ativo: categoria.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: CategoriaCreate) => {
    try {
      if (categoria) {
        await update.mutateAsync({ id: categoria.id, input: values });
        toast.success("Categoria atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Categoria cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar categoria");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {categoria ? "Editar categoria" : "Nova categoria"}
        </h1>
      </div>

      <Card>
        <form id="categoria-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.codigoErp}>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                  <FieldError errors={[form.formState.errors.codigoErp]} />
                </Field>
                <Field className="sm:col-span-2" data-invalid={!!form.formState.errors.descricao}>
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="categoriaPaiId">Categoria pai (subcategoria de)</FieldLabel>
                <Select
                  value={form.watch("categoriaPaiId") ?? "none"}
                  onValueChange={(v) => form.setValue("categoriaPaiId", v === "none" ? null : v)}
                >
                  <SelectTrigger id="categoriaPaiId" className="w-full">
                    <SelectValue placeholder="Nenhuma (categoria raiz)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (categoria raiz)</SelectItem>
                    {opcoesPai.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("usado") === true}
                    onCheckedChange={(v) => form.setValue("usado", v === true)}
                  />
                  Usada nas análises
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("ativo")}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  Categoria ativa
                </label>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {categoria ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
