"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  politicaSenhaUpdateSchema,
  type PoliticaSenha,
  type PoliticaSenhaUpdate,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function PoliticaSenhaPage() {
  const queryClient = useQueryClient();
  const { data: politica, isLoading } = useQuery({
    queryKey: ["politica-senha"],
    queryFn: () => apiFetch<PoliticaSenha>("/politica-senha"),
  });

  const form = useForm<PoliticaSenhaUpdate>({
    resolver: zodResolver(politicaSenhaUpdateSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (politica) form.reset(politica);
  }, [politica, form]);

  const update = useMutation({
    mutationFn: (input: PoliticaSenhaUpdate) =>
      apiFetch<PoliticaSenha>("/politica-senha", { method: "PATCH", body: input }),
    onSuccess: (data) => {
      queryClient.setQueryData(["politica-senha"], data);
      toast.success("Política de senha atualizada");
    },
  });

  const onSubmit = async (values: PoliticaSenhaUpdate) => {
    try {
      await update.mutateAsync(values);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar política de senha");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Política de Senha</h1>

      <Card className="max-w-2xl">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.tamanhoMinimo}>
                  <FieldLabel htmlFor="tamanhoMinimo">Tamanho mínimo</FieldLabel>
                  <Input
                    id="tamanhoMinimo"
                    type="number"
                    min={1}
                    {...form.register("tamanhoMinimo", { setValueAs: (v) => Number(v) })}
                  />
                  <FieldError errors={[form.formState.errors.tamanhoMinimo]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.tamanhoMaximo}>
                  <FieldLabel htmlFor="tamanhoMaximo">Tamanho máximo</FieldLabel>
                  <Input
                    id="tamanhoMaximo"
                    type="number"
                    min={1}
                    {...form.register("tamanhoMaximo", { setValueAs: emptyToNull })}
                  />
                  <FieldDescription>Deixe em branco para não limitar</FieldDescription>
                  <FieldError errors={[form.formState.errors.tamanhoMaximo]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("exigirMaiuscula")}
                    onCheckedChange={(v) => form.setValue("exigirMaiuscula", v === true)}
                  />
                  Maiúscula
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("exigirMinuscula")}
                    onCheckedChange={(v) => form.setValue("exigirMinuscula", v === true)}
                  />
                  Minúscula
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("exigirNumero")}
                    onCheckedChange={(v) => form.setValue("exigirNumero", v === true)}
                  />
                  Número
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("exigirEspecial")}
                    onCheckedChange={(v) => form.setValue("exigirEspecial", v === true)}
                  />
                  Caractere especial
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.diasParaExpirar}>
                  <FieldLabel htmlFor="diasParaExpirar">Dias para expirar</FieldLabel>
                  <Input
                    id="diasParaExpirar"
                    type="number"
                    min={0}
                    {...form.register("diasParaExpirar", { setValueAs: emptyToNull })}
                  />
                  <FieldDescription>Em branco = nunca expira</FieldDescription>
                  <FieldError errors={[form.formState.errors.diasParaExpirar]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.historicoQuantidade}>
                  <FieldLabel htmlFor="historicoQuantidade">Senhas no histórico</FieldLabel>
                  <Input
                    id="historicoQuantidade"
                    type="number"
                    min={0}
                    {...form.register("historicoQuantidade", { setValueAs: (v) => Number(v) })}
                  />
                  <FieldDescription>0 = não valida reuso</FieldDescription>
                  <FieldError errors={[form.formState.errors.historicoQuantidade]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.tentativasAntesBloqueio}>
                  <FieldLabel htmlFor="tentativasAntesBloqueio">Tentativas antes de bloquear</FieldLabel>
                  <Input
                    id="tentativasAntesBloqueio"
                    type="number"
                    min={1}
                    {...form.register("tentativasAntesBloqueio", { setValueAs: (v) => Number(v) })}
                  />
                  <FieldError errors={[form.formState.errors.tentativasAntesBloqueio]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.minutosBloqueio}>
                  <FieldLabel htmlFor="minutosBloqueio">Minutos de bloqueio</FieldLabel>
                  <Input
                    id="minutosBloqueio"
                    type="number"
                    min={1}
                    {...form.register("minutosBloqueio", { setValueAs: (v) => Number(v) })}
                  />
                  <FieldError errors={[form.formState.errors.minutosBloqueio]} />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Salvar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
