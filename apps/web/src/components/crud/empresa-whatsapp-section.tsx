"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useWhatsappIntegracao } from "@/hooks/use-whatsapp-integracao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode, Smartphone, Unplug } from "lucide-react";

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
 * O número institucional da empresa — a porta de entrada do atendimento.
 *
 * Fica no cadastro da empresa, e não na tela do vendedor, porque o número é da
 * empresa: quem o pareia responde por ele, e não há um dono individual. E só
 * aparece com o WhatsApp ativo — oferecer o pareamento antes de a integração
 * existir levaria a um erro que a tela não sabe explicar.
 *
 * Não é a mesma coisa que a conexão de Conversas: lá cada vendedor pareia o
 * próprio aparelho. Os dois convivem.
 */
export function EmpresaWhatsappSection({ empresaId }: { empresaId: string }) {
  const { ativo } = useWhatsappIntegracao();
  const [ocupado, setOcupado] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const { data: sessao, refetch } = useQuery({
    queryKey: ["whatsapp", "sessao-empresa", empresaId],
    queryFn: () => apiFetch<SessaoEmpresa | null>("/whatsapp/config/sessao-empresa"),
    enabled: ativo === true,
    // Enquanto pareia, o estado muda por fora (o worker avisa a API quando o
    // QR é lido): sem recarregar, a tela ficaria em "aguardando" para sempre.
    refetchInterval: (q) =>
      (q.state.data as SessaoEmpresa | null)?.status === "pareando" ? 3000 : false,
  });

  // A integração desligada esconde a seção inteira, em vez de mostrá-la
  // desabilitada: um botão morto no cadastro convida a clicar e não explica.
  if (ativo !== true) return null;

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
          <Smartphone className="size-4" /> WhatsApp da empresa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          O número institucional é a porta de entrada do atendimento: quem
          escreve fala primeiro com a IA, que identifica o cliente e direciona a
          um vendedor. Não substitui o WhatsApp de cada vendedor — os dois
          convivem.
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
