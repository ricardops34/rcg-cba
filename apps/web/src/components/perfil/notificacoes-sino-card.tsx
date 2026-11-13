"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  NOTIFICACAO_GRUPOS,
  NOTIFICACAO_TIPOS,
  NOTIFICACAO_TIPO_INFO,
  type CurrentUser,
  type NotificacaoTipo,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Quais notificações chegam ao sino. Marcado = recebe. A API guarda o
 * contrário (o que foi desligado), para tipo novo nascer ligado.
 *
 * É uma lista com Salvar no rodapé, e não "vale na hora" como as outras
 * escolhas do perfil: quem desliga cinco tipos não quer cinco avisos.
 */
export function NotificacoesSinoCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const salvas = user?.notificacoesSilenciadas ?? [];
  const [desligadas, setDesligadas] = useState<Set<NotificacaoTipo>>(() => new Set(salvas));
  const mudou =
    desligadas.size !== salvas.length || salvas.some((tipo) => !desligadas.has(tipo));

  const salvar = useMutation({
    mutationFn: (notificacoesSilenciadas: NotificacaoTipo[]) =>
      apiFetch<CurrentUser>("/auth/me/notificacoes", {
        method: "PATCH",
        body: { notificacoesSilenciadas },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      queryClient.setQueryData(["auth", "me"], atualizado);
      // O que foi desligado sai do sino agora (a API marca como lido).
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      setDesligadas(new Set(atualizado.notificacoesSilenciadas ?? []));
      toast.success("Notificações atualizadas");
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError ? erro.message : "Não foi possível salvar as notificações",
      ),
  });

  const alternar = (tipo: NotificacaoTipo, recebe: boolean) =>
    setDesligadas((atual) => {
      const novo = new Set(atual);
      if (recebe) novo.delete(tipo);
      else novo.add(tipo);
      return novo;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" />
          O que aparece no sino
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Marcado, você recebe. Desmarcado, não aparece no sino nem no celular.
          </p>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDesligadas(new Set())}
            >
              Marcar todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDesligadas(new Set(NOTIFICACAO_TIPOS))}
            >
              Desmarcar todas
            </Button>
          </div>
        </div>

        {NOTIFICACAO_GRUPOS.map((grupo) => {
          const tipos = NOTIFICACAO_TIPOS.filter(
            (tipo) => NOTIFICACAO_TIPO_INFO[tipo].grupo === grupo.id,
          );
          return (
            <fieldset key={grupo.id} className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{grupo.nome}</legend>
              {grupo.id === "equipe" && (
                <p className="text-xs text-muted-foreground">
                  Só chegam para quem supervisiona ou recebe recados da equipe.
                </p>
              )}
              {tipos.map((tipo) => {
                const info = NOTIFICACAO_TIPO_INFO[tipo];
                const id = `notificacao-${tipo}`;
                return (
                  <div key={tipo} className="flex items-start gap-3 rounded-md px-1 py-1.5">
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={!desligadas.has(tipo)}
                      disabled={salvar.isPending}
                      onCheckedChange={(v) => alternar(tipo, v === true)}
                    />
                    <label htmlFor={id} className="cursor-pointer space-y-0.5">
                      <span className="block text-sm leading-none">{info.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {info.descricao}
                      </span>
                    </label>
                  </div>
                );
              })}
            </fieldset>
          );
        })}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!mudou || salvar.isPending}
          onClick={() => setDesligadas(new Set(salvas))}
        >
          Desfazer
        </Button>
        <Button
          type="button"
          disabled={!mudou || salvar.isPending}
          onClick={() => salvar.mutate([...desligadas])}
        >
          {salvar.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
