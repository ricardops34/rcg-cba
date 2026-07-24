"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  paisCreateSchema,
  paisUpdateSchema,
  type Pais,
  type PaisCreate,
  type PaisUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/paises";

export function PaisForm({ pais }: { pais?: Pais }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<PaisCreate, PaisUpdate>("paises");

  const schema = pais ? paisUpdateSchema : paisCreateSchema;
  const empty: PaisCreate = { codigoErp: "", nome: "", sigla: "", comexId: "", ativo: true };
  const form = useForm<PaisCreate>({
    resolver: zodResolver(schema as typeof paisCreateSchema),
    defaultValues: pais
      ? {
          codigoErp: pais.codigoErp ?? "",
          nome: pais.nome,
          sigla: pais.sigla ?? "",
          comexId: pais.comexId ?? "",
          ativo: pais.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: PaisCreate) => {
    try {
      if (pais) {
        await update.mutateAsync({ id: pais.id, input: values });
        toast.success("País atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("País cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar país");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{pais ? "Editar país" : "Novo país"}</h1>
      </div>

      <Card>
        <form id="pais-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field className="sm:col-span-2" data-invalid={!!form.formState.errors.nome}>
                  <FieldLabel htmlFor="nome">Nome</FieldLabel>
                  <Input id="nome" {...form.register("nome")} />
                  <FieldError errors={[form.formState.errors.nome]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sigla">Sigla</FieldLabel>
                  <Input id="sigla" maxLength={4} {...form.register("sigla")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="comexId">Código COMEX</FieldLabel>
                  <Input id="comexId" {...form.register("comexId")} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                País ativo
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {pais ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
