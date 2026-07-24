"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  armazemCreateSchema,
  armazemUpdateSchema,
  type Armazem,
  type ArmazemCreate,
  type ArmazemUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/armazens";

export function ArmazemForm({ armazem }: { armazem?: Armazem }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<ArmazemCreate, ArmazemUpdate>("armazens");

  const schema = armazem ? armazemUpdateSchema : armazemCreateSchema;
  const empty: ArmazemCreate = { codigoErp: "", descricao: "", ativo: true };
  const form = useForm<ArmazemCreate>({
    resolver: zodResolver(schema as typeof armazemCreateSchema),
    defaultValues: armazem
      ? { codigoErp: armazem.codigoErp, descricao: armazem.descricao, ativo: armazem.ativo }
      : empty,
  });

  const onSubmit = async (values: ArmazemCreate) => {
    try {
      if (armazem) {
        await update.mutateAsync({ id: armazem.id, input: values });
        toast.success("Armazém atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Armazém cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar armazém");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {armazem ? "Editar armazém" : "Novo armazém"}
        </h1>
      </div>

      <Card>
        <form id="armazem-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Armazém ativo
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {armazem ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
