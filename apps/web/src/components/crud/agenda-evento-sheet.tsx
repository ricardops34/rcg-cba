"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Flag, MessageCircle } from "lucide-react";
import type { Atividade } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { rotaDisponivelNoCelular, useMenu } from "@/hooks/use-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetContent } from "@/components/ui/sheet";
import { ROTULO_EVENTO_UNITARIO, categoriaDoEvento } from "@/components/crud/agenda-eventos";

/**
 * Detalhe de um evento da Agenda **no celular**, sem sair dela.
 *
 * A tela de Atividades pode não estar liberada para tela pequena; levar o dedo
 * do vendedor até a mensagem "abra em uma tela maior" é um beco sem saída. Aqui
 * ele vê o evento e faz o que importa na rua: concluir, marcar como importante
 * e abrir a conversa. "Abrir no cadastro" só aparece se a tela estiver liberada.
 */
export function AgendaEventoSheet({
  atividade,
  onClose,
}: {
  atividade: Atividade | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: modulos } = useMenu();
  const podeAbrirCadastro = rotaDisponivelNoCelular(modulos, "/crm/atividades");

  const atualizar = useMutation({
    mutationFn: (dados: { concluida?: boolean; importante?: boolean }) =>
      apiFetch(`/atividades/${atividade!.id}`, { method: "PATCH", body: dados }),
    onSuccess: (_r, dados) => {
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      toast.success(dados.concluida ? "Atividade concluída" : "Atividade atualizada");
      // Concluída sai da agenda do celular; a marca de importante continua à vista.
      if (dados.concluida) onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível atualizar"),
  });

  const quando = atividade?.dataVencimento ? new Date(atividade.dataVencimento) : null;
  const importante = !!atividade?.importante;

  return (
    <Sheet open={!!atividade} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
        {atividade ? (
          <>
            <SheetHeader>
              <SheetTitle className="break-words pr-8">{atividade.titulo}</SheetTitle>
              <SheetDescription>
                {ROTULO_EVENTO_UNITARIO[categoriaDoEvento({ kind: "atividade", data: atividade })]}
                {quando
                  ? ` · ${quando.toLocaleDateString("pt-BR", { dateStyle: "short" })} ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-3 px-4 pb-4 text-sm">
              {atividade.cliente ? (
                <p>
                  <span className="text-xs text-muted-foreground">Cliente</span>
                  <br />
                  {atividade.cliente.nomeFantasia || atividade.cliente.razaoSocial}
                </p>
              ) : null}
              {atividade.descricao ? (
                <p className="whitespace-pre-wrap break-words">
                  <span className="text-xs text-muted-foreground">Observações</span>
                  <br />
                  {atividade.descricao}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {atividade.concluida ? "Concluída" : "Pendente"} ·{" "}
                {atividade.vendedor.nomeReduzido || atividade.vendedor.nome}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {!atividade.concluida ? (
                  <Button
                    type="button"
                    disabled={atualizar.isPending}
                    onClick={() => atualizar.mutate({ concluida: true })}
                  >
                    <CheckCircle2 className="size-4" />
                    Concluir
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={atualizar.isPending}
                  aria-pressed={importante}
                  onClick={() => atualizar.mutate({ importante: !importante })}
                >
                  <Flag
                    className={`size-4 ${importante ? "fill-red-500 text-red-500" : ""}`}
                  />
                  {importante ? "Desmarcar importante" : "Marcar importante"}
                </Button>
                {atividade.conversaId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      router.push(`/comercial/atendimento?conversa=${atividade.conversaId}`)
                    }
                  >
                    <MessageCircle className="size-4" />
                    Abrir conversa
                  </Button>
                ) : null}
                {podeAbrirCadastro ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push(`/crm/atividades/${atividade.id}`)}
                  >
                    <ExternalLink className="size-4" />
                    Abrir no cadastro
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
