"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  feriadoCreateSchema,
  ORIGEM_FERIADO_LABEL,
  type Feriado,
  type FeriadoCreate,
  type FeriadoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/admin/feriados";

export function FeriadoForm({ feriado }: { feriado?: Feriado }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<FeriadoCreate, FeriadoUpdate>("feriados");

  const form = useForm<FeriadoCreate>({
    resolver: zodResolver(feriadoCreateSchema),
    defaultValues: feriado
      ? { data: feriado.data, descricao: feriado.descricao }
      : { data: "", descricao: "" },
  });

  const onSubmit = async (values: FeriadoCreate) => {
    try {
      if (feriado) {
        await update.mutateAsync({ id: feriado.id, input: values });
        toast.success("Feriado atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Feriado cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar feriado");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{feriado ? "Editar feriado" : "Novo feriado"}</h1>
      </div>

      <Card>
        <form id="feriado-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.data}>
                  <FieldLabel htmlFor="data">Data</FieldLabel>
                  <Input id="data" type="date" {...form.register("data")} />
                  <FieldError errors={[form.formState.errors.data]} />
                </Field>
                <Field className="sm:col-span-2" data-invalid={!!form.formState.errors.descricao}>
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" maxLength={120} placeholder="Ex.: Aniversário da cidade" {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
                </Field>
              </div>
              {feriado && feriado.origem !== "manual" && (
                <FieldDescription>
                  Origem: {ORIGEM_FERIADO_LABEL[feriado.origem]}. Ao salvar, passa a ser um feriado cadastrado pela
                  empresa.
                </FieldDescription>
              )}
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {feriado ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
