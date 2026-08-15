"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  WHATSAPP_ACEITE_TEXTO,
  type WhatsappPareamento,
  type WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Conexão do WhatsApp do vendedor — um painel dentro do Atendimento, não uma
 * tela própria: é o vendedor que conecta o aparelho dele, e ele já está aqui.
 */
export function ConexaoSheet({
  aberto,
  onOpenChange,
  sessao,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  sessao: WhatsappSessao | null;
}) {
  const queryClient = useQueryClient();
  const pareando = sessao?.status === "pareando";

  // Só consulta o QR enquanto está pareando: o código expira em segundos e é
  // renovado pelo provedor, então a tela repinta em vez de guardar o primeiro.
  const { data: pareamento } = useQuery({
    queryKey: ["whatsapp-pareamento"],
    queryFn: () => apiFetch<WhatsappPareamento>("/whatsapp/sessao/pareamento"),
    enabled: aberto && pareando,
    refetchInterval: 3000,
  });

  // O QR expira em segundos e o provedor renova; redesenhar a cada conteúdo
  // novo é o que mantém o código válido na tela.
  const [qrImagem, setQrImagem] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    if (!pareamento?.qr) {
      setQrImagem(null);
      return;
    }
    QRCode.toDataURL(pareamento.qr, { margin: 1, width: 512 })
      .then((url) => {
        if (!cancelado) setQrImagem(url);
      })
      .catch(() => {
        if (!cancelado) setQrImagem(null);
      });
    return () => {
      cancelado = true;
    };
  }, [pareamento?.qr]);

  const conectar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappSessao>("/whatsapp/sessao/conectar", {
        method: "POST",
        body: { aceite: true },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-sessao"] });
      toast.success("Leia o QR no seu celular");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao conectar"),
  });

  const desconectar = useMutation({
    mutationFn: () => apiFetch("/whatsapp/sessao", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-sessao"] });
      toast.success("WhatsApp desconectado");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao desconectar"),
  });

  const conectada = sessao?.status === "conectada";

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Conexão do WhatsApp</SheetTitle>
          <SheetDescription>
            Um número por vendedor. Para trocar de aparelho, desconecte antes.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Situação:</span>
            <Badge variant={conectada ? "default" : "secondary"}>
              {conectada
                ? `Conectado${sessao?.numero ? ` — ${sessao.numero}` : ""}`
                : pareando
                  ? "Aguardando leitura do QR"
                  : sessao?.status === "banida"
                    ? "Número bloqueado pelo WhatsApp"
                    : "Desconectado"}
            </Badge>
          </div>

          {sessao?.ultimoErro ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {sessao.ultimoErro}
            </p>
          ) : null}

          {pareando ? (
            <div className="space-y-3">
              {qrImagem ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
                  {/* O provedor devolve o *conteúdo* do QR, não a imagem — o
                      desenho é feito aqui. Fundo branco fixo de propósito: no
                      tema escuro um QR invertido não é lido pela câmera. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImagem}
                    alt="QR code para conectar o WhatsApp"
                    className="size-64 rounded bg-white p-2"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    No celular: WhatsApp → Aparelhos conectados → Conectar
                    aparelho.
                  </p>
                </div>
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </div>
          ) : null}

          {!conectada && !pareando ? (
            <div className="space-y-3">
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {WHATSAPP_ACEITE_TEXTO}
              </p>
              <Button
                className="w-full"
                onClick={() => conectar.mutate()}
                disabled={conectar.isPending}
              >
                Li e concordo — conectar meu WhatsApp
              </Button>
            </div>
          ) : null}

          {conectada || pareando ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => desconectar.mutate()}
              disabled={desconectar.isPending}
            >
              Desconectar
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
