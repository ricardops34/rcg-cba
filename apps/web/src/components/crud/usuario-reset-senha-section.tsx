"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { resetPasswordSchema, type PoliticaSenha, type ResetPasswordInput } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buildSenhaSchema, describeRequisitos } from "@/lib/politica-senha";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, KeyRound } from "lucide-react";

export function UsuarioResetSenhaSection({ usuarioId }: { usuarioId: string }) {
  const [open, setOpen] = useState(false);
  // A política do usuário **alvo**, não a de quem faz o reset: ele pode estar
  // em empresas mais exigentes, e é contra elas que o backend valida.
  const { data: politica } = useQuery({
    queryKey: ["politica-senha", "usuario", usuarioId],
    queryFn: () =>
      apiFetch<PoliticaSenha>(`/politica-senha/usuario/${usuarioId}`),
  });

  const schema = politica
    ? resetPasswordSchema
        .innerType()
        .extend({ novaSenha: buildSenhaSchema(politica) })
        .refine((v) => v.novaSenha === v.confirmarNovaSenha, {
          message: "As senhas não conferem",
          path: ["confirmarNovaSenha"],
        })
    : resetPasswordSchema;

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(schema as typeof resetPasswordSchema),
    defaultValues: { novaSenha: "", confirmarNovaSenha: "", deveTrocarSenha: true },
  });

  const resetSenha = useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiFetch(`/usuarios/${usuarioId}/senha`, { method: "PATCH", body: input }),
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    try {
      await resetSenha.mutateAsync(values);
      toast.success("Senha redefinida");
      form.reset({ novaSenha: "", confirmarNovaSenha: "", deveTrocarSenha: true });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao redefinir senha");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border p-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Redefinir senha
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {/* Div, não <form>: este bloco vive dentro do <form> principal de
            edição do usuário, e HTML não permite <form> aninhado. O submit é
            disparado manualmente pelo onClick do botão. */}
        <div>
          <FieldGroup>
            {politica && (
              <FieldDescription>{describeRequisitos(politica).join(" · ")}</FieldDescription>
            )}

            <Field data-invalid={!!form.formState.errors.novaSenha}>
              <FieldLabel htmlFor="novaSenha">Nova senha</FieldLabel>
              <PasswordInput id="novaSenha" {...form.register("novaSenha")} />
              <FieldError errors={[form.formState.errors.novaSenha]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.confirmarNovaSenha}>
              <FieldLabel htmlFor="confirmarNovaSenha">Confirmar nova senha</FieldLabel>
              <PasswordInput id="confirmarNovaSenha" {...form.register("confirmarNovaSenha")} />
              <FieldError errors={[form.formState.errors.confirmarNovaSenha]} />
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch("deveTrocarSenha")}
                onCheckedChange={(v) => form.setValue("deveTrocarSenha", v === true)}
              />
              Exigir troca no próximo login
            </label>

            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={form.handleSubmit(onSubmit)}
                disabled={form.formState.isSubmitting}
              >
                Redefinir senha
              </Button>
            </div>
          </FieldGroup>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
