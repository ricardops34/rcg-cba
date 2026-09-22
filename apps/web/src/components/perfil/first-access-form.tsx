"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { completeFirstAccessSchema, type CompleteFirstAccessInput, type CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ProfilePhoto } from "./profile-photo";

export function FirstAccessForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const enviandoFoto = useIsMutating({ mutationKey: ["perfil", "foto"] }) > 0;
  const form = useForm<CompleteFirstAccessInput>({
    resolver: zodResolver(completeFirstAccessSchema),
    defaultValues: { nome: user.nome, telefoneInstitucional: user.telefoneInstitucional ?? "", dataNascimento: user.dataNascimento ?? "" },
  });
  const salvar = useMutation({
    mutationFn: (body: CompleteFirstAccessInput) => apiFetch<CurrentUser>("/auth/me/primeiro-acesso", { method: "PATCH", body }),
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.setQueryData(["auth", "me"], updated);
      void queryClient.invalidateQueries({ queryKey: ["inicio", "aniversariantes"] });
    },
  });
  return (
    <section className="w-full max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Confirme seus dados</h1>
        <p className="text-sm text-muted-foreground">Antes de começar, atualize seus dados e adicione uma foto, caso seu perfil ainda não tenha.</p>
      </div>
      <ProfilePhoto user={user} onlyIfMissing disabled={salvar.isPending} />
      <form onSubmit={form.handleSubmit((values) => salvar.mutate(values))} noValidate className="space-y-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="primeiro-nome">Nome</FieldLabel>
            <Input id="primeiro-nome" autoComplete="name" maxLength={120} {...form.register("nome")} />
            <FieldError errors={[form.formState.errors.nome]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="primeiro-telefone">Telefone institucional</FieldLabel>
            <Input id="primeiro-telefone" type="tel" autoComplete="tel" placeholder="(65) 99999-9999" maxLength={30} {...form.register("telefoneInstitucional")} />
            <FieldError errors={[form.formState.errors.telefoneInstitucional]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="primeiro-nascimento">Data de nascimento</FieldLabel>
            <Input id="primeiro-nascimento" type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} {...form.register("dataNascimento")} />
            <FieldError errors={[form.formState.errors.dataNascimento]} />
          </Field>
        </FieldGroup>
        {salvar.isError && <p role="alert" className="text-sm text-destructive">{salvar.error instanceof ApiError ? salvar.error.message : "Não foi possível salvar. Tente novamente."}</p>}
        <Button type="submit" className="w-full" disabled={salvar.isPending || enviandoFoto}>{salvar.isPending ? "Salvando…" : "Salvar e continuar"}</Button>
      </form>
    </section>
  );
}
