"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  orcamentoConfigUpdateSchema,
  type OrcamentoConfig,
  type OrcamentoConfigUpdate,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrcamentoConfigPage() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["orcamento-config"],
    queryFn: () => apiFetch<OrcamentoConfig>("/orcamento-config"),
  });

  const form = useForm<OrcamentoConfigUpdate>({
    resolver: zodResolver(orcamentoConfigUpdateSchema),
    defaultValues: { diasValidade: 30 },
  });

  useEffect(() => {
    if (config) form.reset({ diasValidade: config.diasValidade });
  }, [config, form]);

  const update = useMutation({
    mutationFn: (input: OrcamentoConfigUpdate) =>
      apiFetch<OrcamentoConfig>("/orcamento-config", { method: "PATCH", body: input }),
    onSuccess: (data) => {
      queryClient.setQueryData(["orcamento-config"], data);
      toast.success("Parâmetro de orçamento atualizado");
    },
  });

  const onSubmit = async (values: OrcamentoConfigUpdate) => {
    try {
      await update.mutateAsync(values);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar parâmetro");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Validade de Orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Dias sugeridos para a &quot;Válido até&quot; ao criar um novo orçamento — o vendedor pode
          ajustar a data livremente depois.
        </p>
      </div>

      <Card className="max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.diasValidade}>
                <FieldLabel htmlFor="diasValidade">Dias de validade</FieldLabel>
                <Input
                  id="diasValidade"
                  type="number"
                  min={1}
                  {...form.register("diasValidade", { valueAsNumber: true })}
                />
                <FieldDescription>
                  Ao criar um orçamento, a data de validade sugerida será hoje + esse número de
                  dias.
                </FieldDescription>
                <FieldError errors={[form.formState.errors.diasValidade]} />
              </Field>
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
