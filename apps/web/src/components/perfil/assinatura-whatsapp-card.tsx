"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CurrentUser } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PenLine } from "lucide-react";

/** Como o cliente vê quem escreve: o nome que assina as mensagens enviadas pela plataforma. */
export function AssinaturaWhatsappCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [nomeEditado, setNome] = useState<string | undefined>();
  const [usarEditado, setUsar] = useState<boolean | undefined>();
  const nome = nomeEditado ?? user?.nomeWhatsapp ?? "";
  const usar = usarEditado ?? user?.usarNomeWhatsapp ?? true;
  // Ligado, o nome que assina é obrigatório.
  const falta = usar && !nome.trim();
  const mudou =
    nome.trim() !== (user?.nomeWhatsapp ?? "") || usar !== (user?.usarNomeWhatsapp ?? true);

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: { nome: user?.nome, nomeWhatsapp: nome.trim(), usarNomeWhatsapp: usar },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      setNome(undefined);
      setUsar(undefined);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Assinatura atualizada");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível atualizar a assinatura"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="size-4 text-primary" />
          Assinatura das mensagens
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="nome-whatsapp">Nome na assinatura</FieldLabel>
            <label className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
              <Switch
                checked={usar}
                onCheckedChange={setUsar}
                aria-label="Usar o nome do WhatsApp na assinatura"
              />
              Usar
            </label>
          </div>
          <Input
            id="nome-whatsapp"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            maxLength={40}
            placeholder="Como você quer assinar"
            disabled={!usar}
            required={usar}
            aria-invalid={falta}
          />
          <p className="text-xs text-muted-foreground">
            {usar && nome.trim() ? (
              <>
                O cliente vê <span className="font-medium">*{nome.trim()}:*</span> no começo de cada
                mensagem. Obrigatório enquanto estiver ligado.
              </>
            ) : usar ? (
              "Obrigatório enquanto estiver ligado."
            ) : (
              "Desligado, as mensagens saem sem assinatura."
            )}
          </p>
          {falta ? (
            <p className="text-xs text-destructive">
              Informe o nome que assina as mensagens ou desligue o &quot;Usar&quot;.
            </p>
          ) : null}
        </Field>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={falta || !mudou || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando…" : "Salvar assinatura"}
        </Button>
      </CardFooter>
    </Card>
  );
}
