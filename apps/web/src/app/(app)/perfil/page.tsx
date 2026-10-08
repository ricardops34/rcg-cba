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
  const [nomeWhatsappEditado, setNomeWhatsapp] = useState<string | undefined>();
  const nome = nomeEditado ?? user?.nome ?? "";
  const nascimento = nascimentoEditado ?? user?.dataNascimento ?? "";
  const nomeWhatsapp = nomeWhatsappEditado ?? user?.nomeWhatsapp ?? "";
  const mudou =
    nome.trim() !== user?.nome ||
    nascimento !== (user?.dataNascimento ?? "") ||
    nomeWhatsapp.trim() !== (user?.nomeWhatsapp ?? "");
  const salvarDados = useMutation({
    mutationFn: () =>
      apiFetch<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: {
          nome: nome.trim(),
          nomeWhatsapp: nomeWhatsapp.trim(),
          ...(nascimento ? { dataNascimento: nascimento } : {}),
        },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      setNome(undefined);
      setNascimento(undefined);
      setNomeWhatsapp(undefined);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Dados atualizados");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível atualizar os dados"),
  });
  const empresaAtiva = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  return (
    // Duas pilhas independentes, e não uma grade de linhas: na grade, cada linha
    // assumia a altura do card mais alto, e a Tela inicial esticava vazia ao
    // lado dos Dados da conta.
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Dados da conta</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {user && <ProfilePhoto user={user} />}
              {/* Só leitura: quem muda é o administrador. Fica acima dos campos
                  editáveis para o "Salvar dados" não parecer valer para eles. */}
              <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">E-mail</dt>
                  <dd className="truncate font-medium" title={user?.email}>{user?.email}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Empresa ativa</dt>
                  <dd className="truncate font-medium">{empresaAtiva?.nomeFantasia}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Perfil</dt>
                  <dd className="truncate font-medium">{empresaAtiva?.perfilNome}</dd>
                </div>
              </dl>
              <Field>
                <FieldLabel>Nome</FieldLabel>
                <Input
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  maxLength={120}
                  aria-label="Nome do perfil"
                />
                <p className="text-xs text-muted-foreground">
                  Este nome identifica você na plataforma e no atendimento.
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="nome-whatsapp">Nome no WhatsApp</FieldLabel>
                <Input
                  id="nome-whatsapp"
                  value={nomeWhatsapp}
                  onChange={(event) => setNomeWhatsapp(event.target.value)}
                  maxLength={40}
                  placeholder={user?.nome}
                />
                <p className="text-xs text-muted-foreground">
                  Assina as mensagens que você envia ao cliente pela plataforma
                  {nomeWhatsapp.trim() ? (
                    <>
                      {" "}— ele verá <span className="font-medium">*{nomeWhatsapp.trim()}:*</span>
                    </>
                  ) : null}
                  . Em branco, assina com o nome completo.
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
            </FieldGroup>
          </CardContent>
        </Card>

        <TermosAceitosCard />
      </div>

      <div className="flex flex-col gap-4">
        <TelaInicialCard />

        <ChangePasswordForm />

        <WhatsappPareamentoCard />
      </div>
    </div>
  );
}
