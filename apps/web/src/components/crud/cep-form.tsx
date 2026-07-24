"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cepCreateSchema,
  cepUpdateSchema,
  type Cep,
  type CepCreate,
  type CepUpdate,
  type Estado,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { MunicipioCombobox } from "@/components/crud/municipio-combobox";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/ceps";

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const nanToNull = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : v);

export function CepForm({ cep }: { cep?: Cep }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<CepCreate, CepUpdate>("ceps");

  const estadosQuery = useQuery({
    queryKey: ["estados", "select"],
    queryFn: () =>
      apiFetch<{ data: Estado[] }>("/estados", { query: { pageSize: 100, sortBy: "sigla" } }),
  });
  const opcoesEstado = estadosQuery.data?.data ?? [];

  const schema = cep ? cepUpdateSchema : cepCreateSchema;
  const empty: CepCreate = {
    cep: "",
    estadoId: null,
    municipioId: null,
    bairro: "",
    endereco: "",
    latitude: null,
    longitude: null,
    ativo: true,
  };
  const form = useForm<CepCreate>({
    resolver: zodResolver(schema as typeof cepCreateSchema),
    defaultValues: cep
      ? {
          cep: cep.cep,
          estadoId: cep.estadoId ?? null,
          municipioId: cep.municipioId ?? null,
          bairro: cep.bairro ?? "",
          endereco: cep.endereco ?? "",
          latitude: cep.latitude ?? null,
          longitude: cep.longitude ?? null,
          ativo: cep.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: CepCreate) => {
    const payload: CepCreate = {
      ...values,
      latitude: nanToNull(values.latitude),
      longitude: nanToNull(values.longitude),
    };
    try {
      if (cep) {
        await update.mutateAsync({ id: cep.id, input: payload });
        toast.success("CEP atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("CEP cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar CEP");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{cep ? "Editar CEP" : "Novo CEP"}</h1>
      </div>

      <Card>
        <form id="cep-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.cep}>
                  <FieldLabel htmlFor="cep">CEP</FieldLabel>
                  <Input id="cep" maxLength={9} {...form.register("cep")} />
                  <FieldError errors={[form.formState.errors.cep]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="estadoId">Estado</FieldLabel>
                  <Select
                    value={form.watch("estadoId") ?? "none"}
                    onValueChange={(v) => {
                      form.setValue("estadoId", v === "none" ? null : v);
                      form.setValue("municipioId", null);
                    }}
                  >
                    <SelectTrigger id="estadoId" className="w-full">
                      <SelectValue placeholder="Sem estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem estado</SelectItem>
                      {opcoesEstado.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.sigla}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Município</FieldLabel>
                  <MunicipioCombobox
                    value={form.watch("municipioId") ?? null}
                    onChange={(id) => form.setValue("municipioId", id)}
                    estadoId={form.watch("estadoId")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
                  <Input id="endereco" {...form.register("endereco")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bairro">Bairro</FieldLabel>
                  <Input id="bairro" {...form.register("bairro")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.latitude}>
                  <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    {...form.register("latitude", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.latitude]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.longitude}>
                  <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    {...form.register("longitude", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.longitude]} />
                </Field>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("ativo")}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  CEP ativo
                </label>
                {cep?.origem && (
                  <p className="text-xs text-muted-foreground">Origem da consulta: {cep.origem}</p>
                )}
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {cep ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
