"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { WhatsappConfig } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode, Smartphone, TriangleAlert, Unplug } from "lucide-react";

interface SessaoEmpresa {
  id: string;
  numero: string | null;
  status: "desconectada" | "pareando" | "conectada" | "banida";
  ultimoErro: string | null;
}

const ROTULO: Record<SessaoEmpresa["status"], string> = {
  desconectada: "Desconectado",
  pareando: "Aguardando leitura do QR",
  conectada: "Conectado",
  banida: "Número banido pelo WhatsApp",
};

/**
 * O número institucional da empresa — a porta de entrada do atendimento por
 * IA (identifica quem escreve e direciona a um vendedor). Fica na mesma tela
 * das demais configurações de WhatsApp, e não escondido no cadastro da
 * empresa: é aqui que se liga o provedor, e é aqui que se espera achar o
 * pareamento também.
 *
 * Não é a mesma coisa que a conexão de Comercial → Conversas: lá cada
 * vendedor pareia o próprio aparelho. Os dois convivem.
 *
 * Diferente das demais abas desta tela, não desaparece com o WhatsApp
 * desligado — mostra o que falta em vez de sumir, para não repetir o
 * problema de quem procurava o pareamento e não achava onde ligá-lo primeiro.
 */
export function InstitucionalConfig({ config }: { config: WhatsappConfig }) {
  const [ocupado, setOcupado] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const { data: sessao, refetch } = useQuery({
    queryKey: ["whatsapp", "sessao-empresa"],
    queryFn: () => apiFetch<SessaoEmpresa | null>("/whatsapp/config/sessao-empresa"),
    enabled: config.ativo === true,
    // Enquanto pareia, o estado muda por fora (o worker avisa a API quando o
    // QR é lido): sem recarregar, a tela ficaria em "aguardando" para sempre.
    refetchInterval: (q) =>
      (q.state.data as SessaoEmpresa | null)?.status === "pareando" ? 3000 : false,
  });

  if (config.ativo !== true) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4" /> Número institucional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              O WhatsApp está desativado para esta empresa. Ligue-o na aba{" "}
              <strong>zapo-js</strong> ou <strong>Evolution GO</strong> (o switch
              &quot;Ativo&quot; e o botão de salvar) antes de parear o número
              institucional.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const conectar = async () => {
    setOcupado(true);
    try {
      await apiFetch("/whatsapp/config/sessao-empresa/conectar", {
        method: "POST",
        body: {},
      });
      await refetch();
      await buscarQr();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível iniciar o pareamento",
      );
    } finally {
      setOcupado(false);
    }
  };

  const buscarQr = async () => {
    try {
      const r = await apiFetch<{ qrCode?: string | null }>(
        "/whatsapp/config/sessao-empresa/pareamento",
      );
      setQr(r.qrCode ?? null);
    } catch {
      setQr(null);
    }
  };

  const desconectar = async () => {
    if (
      !confirm(
        "Desconectar o número da empresa? O atendimento automático para de receber mensagens. As conversas ficam.",
      )
    )
      return;
    setOcupado(true);
    try {
      await apiFetch("/whatsapp/config/sessao-empresa", { method: "DELETE" });
      setQr(null);
      await refetch();
      toast.success("Número desconectado");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível desconectar",
      );
    } finally {
      setOcupado(false);
    }
  };

  const status = sessao?.status ?? "desconectada";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4" /> Número institucional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          O número institucional é a porta de entrada do atendimento: quem
          escreve fala primeiro com a IA, que identifica o cliente e direciona a
          um vendedor. Não substitui o WhatsApp de cada vendedor (pareado em
          Comercial → Conversas) — os dois convivem.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              status === "conectada"
                ? "default"
                : status === "banida"
                  ? "destructive"
                  : "secondary"
            }
          >
            {ROTULO[status]}
          </Badge>
          {sessao?.numero && (
            <span className="font-mono text-sm">{sessao.numero}</span>
          )}
        </div>

        {sessao?.ultimoErro && (
          <p className="text-xs text-destructive">{sessao.ultimoErro}</p>
        )}

        {status === "pareando" && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Abra o WhatsApp do número da empresa → Aparelhos conectados →
              Conectar aparelho, e leia o código.
            </p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="QR de pareamento"
                className="mx-auto size-56 rounded bg-white p-2"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> gerando o código...
              </div>
            )}
            <Button variant="outline" size="sm" onClick={buscarQr} className="w-full">
              <QrCode className="size-4" /> Gerar novo código
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status !== "conectada" && (
            <Button onClick={conectar} disabled={ocupado}>
              <QrCode className="size-4" />
              {status === "pareando" ? "Recomeçar pareamento" : "Parear número"}
            </Button>
          )}
          {sessao && status !== "desconectada" && (
            <Button variant="outline" onClick={desconectar} disabled={ocupado}>
              <Unplug className="size-4" /> Desconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
