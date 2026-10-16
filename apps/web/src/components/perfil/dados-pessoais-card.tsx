"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CurrentUser } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Nome e data de nascimento — o que a pessoa **é**. O que vale só no
 * WhatsApp (assinatura, número) mora na aba WhatsApp, cada um com o seu Salvar.
 */
export function DadosPessoaisCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [nomeEditado, setNome] = useState<string | undefined>();
  const [nascimentoEditado, setNascimento] = useState<string | undefined>();
  const nome = nomeEditado ?? user?.nome ?? "";
  const nascimento = nascimentoEditado ?? user?.dataNascimento ?? "";
  const mudou = nome.trim() !== user?.nome || nascimento !== (user?.dataNascimento ?? "");

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: { nome: nome.trim(), ...(nascimento ? { dataNascimento: nascimento } : {}) },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      setNome(undefined);
      setNascimento(undefined);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Dados atualizados");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível atualizar os dados"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados pessoais</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="perfil-nome">Nome</FieldLabel>
            <Input
              id="perfil-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              maxLength={120}
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              Identifica você na plataforma e no atendimento.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="nascimento">Data de nascimento</FieldLabel>
            <Input
              id="nascimento"
              type="date"
              className="sm:w-56"
              value={nascimento}
              onChange={(event) => setNascimento(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={nome.trim().length < 2 || !mudou || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando…" : "Salvar dados"}
        </Button>
      </CardFooter>
    </Card>
  );
}
