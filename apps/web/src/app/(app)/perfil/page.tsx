"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "@plataforma/contracts";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { WhatsappPareamentoCard } from "@/components/perfil/whatsapp-pareamento-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TermosAceitosCard } from "@/components/perfil/termos-aceitos-card";
import { ProfilePhoto } from "@/components/perfil/profile-photo";
import { TelaInicialCard } from "@/components/perfil/tela-inicial-card";

export default function PerfilPage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [nomeEditado, setNome] = useState<string | undefined>();
  const [nascimentoEditado, setNascimento] = useState<string | undefined>();
  const nome = nomeEditado ?? user?.nome ?? "";
  const nascimento = nascimentoEditado ?? user?.dataNascimento ?? "";
  const mudou = nome.trim() !== user?.nome || nascimento !== (user?.dataNascimento ?? "");
  const salvarDados = useMutation({
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
  const empresaAtiva = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {user && <ProfilePhoto user={user} />}
            <Field>
              <FieldLabel>Nome</FieldLabel>
              <Input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                maxLength={120}
                aria-label="Nome do perfil"
              />
              <p className="text-xs text-muted-foreground">
                Este nome identifica você no atendimento e assina as mensagens enviadas ao cliente.
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
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={nome.trim().length < 2 || !mudou || salvarDados.isPending}
                onClick={() => salvarDados.mutate()}
              >
                {salvarDados.isPending ? "Salvando…" : "Salvar dados"}
              </Button>
            </div>
            <Field>
              <FieldLabel>E-mail</FieldLabel>
              <p className="text-sm">{user?.email}</p>
            </Field>
            <Field>
              <FieldLabel>Empresa ativa</FieldLabel>
              <p className="text-sm">{empresaAtiva?.nomeFantasia}</p>
            </Field>
            <Field>
              <FieldLabel>Perfil</FieldLabel>
              <p className="text-sm">{empresaAtiva?.perfilNome}</p>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <TelaInicialCard />

      <ChangePasswordForm />

      <TermosAceitosCard />

      <WhatsappPareamentoCard />
    </div>
  );
}
