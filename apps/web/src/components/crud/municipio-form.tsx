"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  municipioCreateSchema,
  municipioUpdateSchema,
  type Estado,
  type Municipio,
  type MunicipioCreate,
  type MunicipioUpdate,
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

const LIST_ROUTE = "/cadastros/municipios";

export function MunicipioForm({ municipio }: { municipio?: Municipio }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<MunicipioCreate, MunicipioUpdate>("municipios");

  const estadosQuery = useQuery({
    queryKey: ["estados", "select"],
    queryFn: () =>
      apiFetch<{ data: Estado[] }>("/estados", { query: { pageSize: 100, sortBy: "sigla" } }),
  });
  const opcoesEstado = estadosQuery.data?.data ?? [];

  const schema = municipio ? municipioUpdateSchema : municipioCreateSchema;
  const empty: MunicipioCreate = {
    codigoErp: "",
    descricao: "",
    estadoId: null,
    codigoIbge: "",
    ativo: true,
  };
  const form = useForm<MunicipioCreate>({
    resolver: zodResolver(schema as typeof municipioCreateSchema),
    defaultValues: municipio
      ? {
          codigoErp: municipio.codigoErp ?? "",
          descricao: municipio.descricao,
          estadoId: municipio.estadoId ?? null,
          codigoIbge: municipio.codigoIbge ?? "",
          ativo: municipio.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: MunicipioCreate) => {
    try {
      if (municipio) {
        await update.mutateAsync({ id: municipio.id, input: values });
        toast.success("Município atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Município cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar município");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {municipio ? "Editar município" : "Novo município"}
        </h1>
      </div>

      <Card>
        <form id="municipio-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field className="sm:col-span-2" data-invalid={!!form.formState.errors.descricao}>
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="estadoId">Estado</FieldLabel>
                  <Select
                    value={form.watch("estadoId") ?? "none"}
                    onValueChange={(v) => form.setValue("estadoId", v === "none" ? null : v)}
                  >
                    <SelectTrigger id="estadoId" className="w-full">
                      <SelectValue placeholder="Sem estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem estado</SelectItem>
                      {opcoesEstado.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.sigla} — {e.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="codigoIbge">Código IBGE</FieldLabel>
                  <Input id="codigoIbge" {...form.register("codigoIbge")} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Município ativo
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {municipio ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
