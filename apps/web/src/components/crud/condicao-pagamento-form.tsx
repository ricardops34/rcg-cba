"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  condicaoPagamentoCreateSchema,
  condicaoPagamentoUpdateSchema,
  type CondicaoPagamento,
  type CondicaoPagamentoCreate,
  type CondicaoPagamentoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/condicoes-pagamento";

export function CondicaoPagamentoForm({ condicao }: { condicao?: CondicaoPagamento }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<CondicaoPagamentoCreate, CondicaoPagamentoUpdate>(
    "condicoes-pagamento",
  );

  const schema = condicao ? condicaoPagamentoUpdateSchema : condicaoPagamentoCreateSchema;
  const empty: CondicaoPagamentoCreate = { codigoErp: "", descricao: "", forma: "", ativo: true };
  const form = useForm<CondicaoPagamentoCreate>({
    resolver: zodResolver(schema as typeof condicaoPagamentoCreateSchema),
    defaultValues: condicao
      ? {
          codigoErp: condicao.codigoErp,
          descricao: condicao.descricao,
          forma: condicao.forma ?? "",
          ativo: condicao.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: CondicaoPagamentoCreate) => {
    try {
      if (condicao) {
        await update.mutateAsync({ id: condicao.id, input: values });
        toast.success("Condição de pagamento atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Condição de pagamento cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar condição de pagamento");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {condicao ? "Editar condição de pagamento" : "Nova condição de pagamento"}
        </h1>
      </div>

      <Card>
        <form id="condicao-pagamento-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.forma}>
                  <FieldLabel htmlFor="forma">Forma (ex.: BOL, R$)</FieldLabel>
                  <Input id="forma" maxLength={3} {...form.register("forma")} />
                  <FieldError errors={[form.formState.errors.forma]} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Condição ativa
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {condicao ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
