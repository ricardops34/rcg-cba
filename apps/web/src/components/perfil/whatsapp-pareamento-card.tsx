"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateOwnProfileSchema,
  type CurrentUser,
  type WhatsappMeuNumero,
} from "@plataforma/contracts";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Smartphone } from "lucide-react";

/**
 * O código que confirma, no WhatsApp da empresa, que aquele número é seu.
 *
 * **Este é o único lugar onde o código aparece**, e é o que faz a posse do
 * celular não bastar: para ler aqui é preciso ter entrado no sistema com
 * senha. Sem essa segunda etapa, um aparelho emprestado, perdido ou clonado
 * consultaria a carteira de quem o perdeu.
 */
export function WhatsappPareamentoCard() {
  const user = useAuthStore((s) => s.user);
  return user ? (
    <WhatsappDoUsuario key={`${user.id}:${user.empresaAtivaId}`} user={user} />
  ) : null;
}

function WhatsappDoUsuario({ user }: { user: CurrentUser }) {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [editado, setEditado] = useState<string | undefined>();
  const numero = editado ?? user.whatsapp ?? "";
  const salvar = useMutation({
    mutationFn: async () => {
      const input = updateOwnProfileSchema.safeParse({
        nome: user.nome,
        whatsapp: numero,
      });
      if (!input.success) throw new Error(input.error.issues[0].message);
      return apiFetch<CurrentUser>("/auth/me", {
        method: "PATCH",
        body: input.data,
      });
    },
    onSuccess: (atualizado) => {
      setUser(atualizado);
      setEditado(undefined);
      queryClient.setQueryData(["auth", "me"], atualizado);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-meu-numero"] });
      toast.success("Número de telefone atualizado");
    },
    onError: (error) => toast.error(error.message),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-meu-numero", user.id, user.empresaAtivaId],
    queryFn: () => apiFetch<WhatsappMeuNumero>("/whatsapp/meu-numero"),
    // O código vale poucos minutos e nasce quando a pessoa escreve no
    // WhatsApp — ou seja, enquanto esta tela já está aberta. Sem recarregar
    // sozinha, ela mostraria "nenhum código" justamente na hora do uso.
    refetchInterval: 15_000,
  });

  const formatarTelefone = (bruto: string) => {
    const d = bruto.replace(/\D/g, "").replace(/^55/, "");
    if (d.length < 10) return bruto;
    return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4" />
          Número de telefone
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor="whatsapp-pessoal">
            Número de telefone com DDD
          </FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="whatsapp-pessoal"
              type="tel"
              autoComplete="tel"
              placeholder="65 99999-9999"
              maxLength={20}
              value={numero}
              onChange={(e) => setEditado(e.target.value)}
            />
            <Button
              type="button"
              disabled={salvar.isPending || numero === (user.whatsapp ?? "")}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? "Salvando…" : "Salvar número"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Informe o número que você utiliza para conversar pelo WhatsApp.
            Quando o agente de IA estiver configurado no WhatsApp institucional
            desta empresa, ele usará este número para identificar você. Ao
            trocar o número, será necessário confirmá-lo novamente.
          </p>
        </Field>
        {!isLoading &&
          data &&
          (data.codigo ? (
            <>
              <p className="text-sm text-muted-foreground">
                Mande este código na conversa com o WhatsApp da empresa para eu
                confirmar que o número é seu:
              </p>
              <p className="font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums">
                {data.codigo}
              </p>
              <p className="text-xs text-muted-foreground">
                Vale por poucos minutos. Se expirar, escreva de novo no WhatsApp
                que eu gero outro.
              </p>
            </>
          ) : data.confirmado ? (
            <div className="space-y-2">
              <Badge
                variant="outline"
                className="gap-1.5 border-emerald-500/50 text-emerald-600"
              >
                <CheckCircle2 className="size-3.5" />
                Número confirmado
              </Badge>
              <p className="text-sm text-muted-foreground">
                {data.telefone ? `${formatarTelefone(data.telefone)} — ` : ""}
                você pode consultar títulos vencidos, agenda e situação de
                cliente conversando com o WhatsApp da empresa.
                {data.validoAte && (
                  <>
                    {" "}
                    A confirmação vale até{" "}
                    {new Date(data.validoAte).toLocaleDateString("pt-BR")}.
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Por ali é só consulta. Criar ou alterar qualquer coisa continua
                sendo aqui no sistema.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mande uma mensagem para o WhatsApp da empresa pelo seu celular
              cadastrado. Um código aparecerá aqui para você confirmar que o
              número é seu — e só então eu respondo sobre a sua carteira por lá.
            </p>
          ))}
      </CardContent>
    </Card>
  );
}
