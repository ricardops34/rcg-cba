"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { changePasswordSchema, type ChangePasswordInput, type PoliticaSenha } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buildSenhaSchema, describeRequisitos } from "@/lib/politica-senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ChangePasswordForm() {
  const { data: politica } = useQuery({
    queryKey: ["politica-senha"],
    queryFn: () => apiFetch<PoliticaSenha>("/politica-senha"),
  });

  const schema = politica
    ? changePasswordSchema
        .innerType()
        .extend({ novaSenha: buildSenhaSchema(politica) })
        .refine((v) => v.novaSenha === v.confirmarNovaSenha, {
          message: "As senhas não conferem",
          path: ["confirmarNovaSenha"],
        })
    : changePasswordSchema;

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(schema as typeof changePasswordSchema),
    defaultValues: { senhaAtual: "", novaSenha: "", confirmarNovaSenha: "" },
  });

  const changePassword = useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch("/auth/change-password", { method: "PATCH", body: input }),
  });

  const onSubmit = async (values: ChangePasswordInput) => {
    try {
      await changePassword.mutateAsync(values);
      toast.success("Senha alterada com sucesso");
      form.reset({ senhaAtual: "", novaSenha: "", confirmarNovaSenha: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao trocar senha");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.senhaAtual}>
              <FieldLabel htmlFor="senhaAtual">Senha atual</FieldLabel>
              <Input id="senhaAtual" type="password" autoComplete="current-password" {...form.register("senhaAtual")} />
              <FieldError errors={[form.formState.errors.senhaAtual]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.novaSenha}>
              <FieldLabel htmlFor="novaSenha">Nova senha</FieldLabel>
              <Input id="novaSenha" type="password" autoComplete="new-password" {...form.register("novaSenha")} />
              {politica && (
                <FieldDescription>{describeRequisitos(politica).join(" · ")}</FieldDescription>
              )}
              <FieldError errors={[form.formState.errors.novaSenha]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.confirmarNovaSenha}>
              <FieldLabel htmlFor="confirmarNovaSenha">Confirmar nova senha</FieldLabel>
              <Input
                id="confirmarNovaSenha"
                type="password"
                autoComplete="new-password"
                {...form.register("confirmarNovaSenha")}
              />
              <FieldError errors={[form.formState.errors.confirmarNovaSenha]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Trocar senha
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
