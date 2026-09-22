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

export default function PerfilPage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [nomeEditado, setNome] = useState<string | undefined>();
  const nome = nomeEditado ?? user?.nome ?? "";
  const salvarNome = useMutation({
    mutationFn: () =>
      apiFetch<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: { nome: nome.trim() },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      setNome(undefined);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Nome do perfil atualizado");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível atualizar o nome"),
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  maxLength={120}
                  aria-label="Nome do perfil"
                />
                <Button
                  type="button"
                  disabled={nome.trim().length < 2 || nome.trim() === user?.nome || salvarNome.isPending}
                  onClick={() => salvarNome.mutate()}
                >
                  {salvarNome.isPending ? "Salvando…" : "Salvar nome"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Este nome identifica você no atendimento e assina as mensagens enviadas ao cliente.
              </p>
            </Field>
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

      <ChangePasswordForm />

      <TermosAceitosCard />

      <WhatsappPareamentoCard />
    </div>
  );
}
