"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  cnaeCreateSchema,
  cnaeUpdateSchema,
  type Cnae,
  type CnaeCreate,
  type CnaeUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/cnaes";

export function CnaeForm({ cnae }: { cnae?: Cnae }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<CnaeCreate, CnaeUpdate>("cnaes");

  const schema = cnae ? cnaeUpdateSchema : cnaeCreateSchema;
  const empty: CnaeCreate = {
    codigoErp: "",
    secao: "",
    divisao: "",
    grupo: "",
    classe: "",
    subclasse: "",
    descricao: "",
    ativo: true,
  };
  const form = useForm<CnaeCreate>({
    resolver: zodResolver(schema as typeof cnaeCreateSchema),
    defaultValues: cnae
      ? {
          codigoErp: cnae.codigoErp ?? "",
          secao: cnae.secao ?? "",
          divisao: cnae.divisao ?? "",
          grupo: cnae.grupo ?? "",
          classe: cnae.classe ?? "",
          subclasse: cnae.subclasse ?? "",
          descricao: cnae.descricao,
          ativo: cnae.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: CnaeCreate) => {
    try {
      if (cnae) {
        await update.mutateAsync({ id: cnae.id, input: values });
        toast.success("CNAE atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("CNAE cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar CNAE");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{cnae ? "Editar CNAE" : "Novo CNAE"}</h1>
      </div>

      <Card>
        <form id="cnae-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.descricao}>
                <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                <Input id="descricao" {...form.register("descricao")} />
                <FieldError errors={[form.formState.errors.descricao]} />
              </Field>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.secao}>
                  <FieldLabel htmlFor="secao">Seção</FieldLabel>
                  <Input id="secao" maxLength={1} {...form.register("secao")} />
                  <FieldError errors={[form.formState.errors.secao]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="divisao">Divisão</FieldLabel>
                  <Input id="divisao" {...form.register("divisao")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="grupo">Grupo</FieldLabel>
                  <Input id="grupo" {...form.register("grupo")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="classe">Classe</FieldLabel>
                  <Input id="classe" {...form.register("classe")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="subclasse">Subclasse</FieldLabel>
                  <Input id="subclasse" {...form.register("subclasse")} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                CNAE ativo
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {cnae ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
