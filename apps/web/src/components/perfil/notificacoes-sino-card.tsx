"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  NOTIFICACAO_GRUPOS,
  NOTIFICACAO_TIPOS,
  NOTIFICACAO_TIPOS_SEM_NAVEGADOR,
  NOTIFICACAO_TIPO_INFO,
  type CurrentUser,
  type NotificacaoTipo,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type Coluna = "sino" | "navegador";

const mesmoConjunto = (a: Set<NotificacaoTipo>, b: readonly NotificacaoTipo[]) =>
  a.size === b.length && b.every((t) => a.has(t));

/**
 * Quais notificações chegam, em duas colunas (decisão de 2026-11-13): o
 * **Sino** e o **Navegador** (a notificação do computador/celular, mesmo com
 * o sistema fechado). Marcado = recebe. A API guarda o contrário (o que foi
 * desligado), para tipo novo nascer ligado nos dois.
 *
 * O aviso do navegador sai do registro do sino: com o Sino desmarcado não há
 * o que enviar, e a caixa do Navegador fica desativada.
 *
 * Salvar no rodapé, e não "vale na hora" como as outras escolhas do perfil:
 * quem desliga cinco tipos não quer cinco avisos.
 */
export function NotificacoesSinoCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const salvasSino = user?.notificacoesSilenciadas ?? [];
  const salvasNavegador = user?.navegadorSilenciadas ?? [];
  const [foraSino, setForaSino] = useState(() => new Set(salvasSino));
  const [foraNavegador, setForaNavegador] = useState(() => new Set(salvasNavegador));
  const mudou = !mesmoConjunto(foraSino, salvasSino) || !mesmoConjunto(foraNavegador, salvasNavegador);

  const salvar = useMutation({
    mutationFn: (corpo: {
      notificacoesSilenciadas: NotificacaoTipo[];
      navegadorSilenciadas: NotificacaoTipo[];
    }) => apiFetch<CurrentUser>("/auth/me/notificacoes", { method: "PATCH", body: corpo }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      queryClient.setQueryData(["auth", "me"], atualizado);
      // O que foi desligado do sino sai dele agora (a API marca como lido).
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      setForaSino(new Set(atualizado.notificacoesSilenciadas ?? []));
      setForaNavegador(new Set(atualizado.navegadorSilenciadas ?? []));
      toast.success("Notificações atualizadas");
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError ? erro.message : "Não foi possível salvar as notificações",
      ),
  });

  const semNavegador = (tipo: NotificacaoTipo) => NOTIFICACAO_TIPOS_SEM_NAVEGADOR.includes(tipo);

  const alternar = (coluna: Coluna, tipo: NotificacaoTipo, recebe: boolean) => {
    const set = coluna === "sino" ? setForaSino : setForaNavegador;
    set((atual) => {
      const novo = new Set(atual);
      if (recebe) novo.delete(tipo);
      else novo.add(tipo);
      return novo;
    });
  };

  const todas = (coluna: Coluna, recebe: boolean) => {
    const set = coluna === "sino" ? setForaSino : setForaNavegador;
    set(new Set(recebe ? [] : NOTIFICACAO_TIPOS));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" />
          O que você recebe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          <strong>Sino:</strong> aparece no sino do sistema. <strong>Navegador:</strong> aparece
          também como notificação do computador ou do celular, mesmo com o sistema em outra aba
          — para isso, ative as notificações do navegador acima. Sem o sino, o navegador não
          recebe.
        </p>

        {/* Cabeçalho das colunas, com marcar/desmarcar todas de cada uma. */}
        <div className="flex items-end gap-3 border-b pb-2 text-xs font-medium">
          <span className="flex-1 text-muted-foreground">Tipo</span>
          {(["sino", "navegador"] as const).map((coluna) => {
            const fora = coluna === "sino" ? foraSino : foraNavegador;
            const tudoLigado = fora.size === 0;
            return (
              <div key={coluna} className="flex w-20 flex-col items-center gap-0.5">
                <span>{coluna === "sino" ? "Sino" : "Navegador"}</span>
                <button
                  type="button"
                  className="font-normal text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={salvar.isPending}
                  onClick={() => todas(coluna, !tudoLigado)}
                >
                  {tudoLigado ? "nenhuma" : "todas"}
                </button>
              </div>
            );
          })}
        </div>

        {NOTIFICACAO_GRUPOS.map((grupo) => {
          const tipos = NOTIFICACAO_TIPOS.filter(
            (tipo) => NOTIFICACAO_TIPO_INFO[tipo].grupo === grupo.id,
          );
          return (
            <fieldset key={grupo.id} className="space-y-1">
              <legend className="mb-1 text-sm font-medium">{grupo.nome}</legend>
              {grupo.id === "equipe" && (
                <p className="text-xs text-muted-foreground">
                  Só chegam para quem supervisiona ou recebe recados da equipe.
                </p>
              )}
              {tipos.map((tipo) => {
                const info = NOTIFICACAO_TIPO_INFO[tipo];
                const noSino = !foraSino.has(tipo);
                const idSino = `notificacao-sino-${tipo}`;
                return (
                  <div key={tipo} className="flex items-start gap-3 rounded-md py-1.5">
                    <label htmlFor={idSino} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                      <span className="block text-sm leading-tight">{info.nome}</span>
                      <span className="block text-xs text-muted-foreground">{info.descricao}</span>
                    </label>
                    <div className="flex w-20 justify-center pt-0.5">
                      <Checkbox
                        id={idSino}
                        aria-label={`${info.nome} no sino`}
                        checked={noSino}
                        disabled={salvar.isPending}
                        onCheckedChange={(v) => alternar("sino", tipo, v === true)}
                      />
                    </div>
                    <div className="flex w-20 justify-center pt-0.5">
                      {semNavegador(tipo) ? (
                        <span
                          className="text-xs text-muted-foreground"
                          title="Mensagem de WhatsApp não vira notificação do navegador: ela tem o ícone próprio."
                        >
                          —
                        </span>
                      ) : (
                        <Checkbox
                          aria-label={`${info.nome} no navegador`}
                          checked={noSino && !foraNavegador.has(tipo)}
                          disabled={salvar.isPending || !noSino}
                          onCheckedChange={(v) => alternar("navegador", tipo, v === true)}
                        />
                      )}
                    </div>
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
          onClick={() => {
            setForaSino(new Set(salvasSino));
            setForaNavegador(new Set(salvasNavegador));
          }}
        >
          Desfazer
        </Button>
        <Button
          type="button"
          disabled={!mudou || salvar.isPending}
          onClick={() =>
            salvar.mutate({
              notificacoesSilenciadas: [...foraSino],
              // Tipo fora do sino já não vai ao navegador; a API descarta
              // também, mas não há por que mandar.
              navegadorSilenciadas: [...foraNavegador].filter(
                (t) => !foraSino.has(t) && !semNavegador(t),
              ),
            })
          }
        >
          {salvar.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
