"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  estadoCreateSchema,
  estadoUpdateSchema,
  type Estado,
  type EstadoCreate,
  type EstadoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/estados";

export function EstadoForm({ estado }: { estado?: Estado }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<EstadoCreate, EstadoUpdate>("estados");

  const schema = estado ? estadoUpdateSchema : estadoCreateSchema;
  const empty: EstadoCreate = { codigoErp: "", sigla: "", descricao: "", codigoIbge: "", ativo: true };
  const form = useForm<EstadoCreate>({
    resolver: zodResolver(schema as typeof estadoCreateSchema),
    defaultValues: estado
      ? {
          codigoErp: estado.codigoErp ?? "",
          sigla: estado.sigla,
          descricao: estado.descricao,
          codigoIbge: estado.codigoIbge ?? "",
          ativo: estado.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: EstadoCreate) => {
    try {
      if (estado) {
        await update.mutateAsync({ id: estado.id, input: values });
        toast.success("Estado atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Estado cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar estado");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {estado ? "Editar estado" : "Novo estado"}
        </h1>
      </div>

      <Card>
        <form id="estado-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field data-invalid={!!form.formState.errors.sigla}>
                  <FieldLabel htmlFor="sigla">Sigla (UF)</FieldLabel>
                  <Input id="sigla" maxLength={2} {...form.register("sigla")} />
                  <FieldError errors={[form.formState.errors.sigla]} />
                </Field>
                <Field className="sm:col-span-3" data-invalid={!!form.formState.errors.descricao}>
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
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
                Estado ativo
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {estado ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
