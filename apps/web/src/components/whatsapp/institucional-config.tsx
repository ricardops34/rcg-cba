"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  WHATSAPP_TRANSPORTE_ROTULO,
  type WhatsappConfig,
  type WhatsappPareamento,
  type WhatsappTransporte,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode, Smartphone, TriangleAlert, Unplug } from "lucide-react";
import { useImagemQr } from "./use-imagem-qr";

interface SessaoEmpresa {
  id: string;
  numero: string | null;
  status: "desconectada" | "pareando" | "conectada" | "banida";
  transporte: WhatsappTransporte;
  ultimoErro: string | null;
}

const ROTULO: Record<SessaoEmpresa["status"], string> = {
  desconectada: "Desconectado",
  pareando: "Aguardando leitura do QR",
  conectada: "Conectado",
  banida: "Número banido pelo WhatsApp",
};

/** Provedores que a plataforma sabe operar — mesma lista de WHATSAPP_TRANSPORTES_IMPLEMENTADOS. */
const PROVEDORES_ESCOLHIVEIS: WhatsappTransporte[] = ["zapo", "evolution_go", "cloud_api"];

/**
 * O número institucional da empresa — a porta de entrada do atendimento por
 * IA (identifica quem escreve e direciona a um vendedor).
 *
 * `empresaId` ausente = a empresa ativa da sessão (usado na aba "Número
 * institucional" de Administração > WhatsApp, endpoints de sessão própria).
 * `empresaId` presente = qualquer empresa (usado no diálogo aberto a partir
 * de Administração > Empresas, endpoints `.../config/empresas/:id/...`,
 * só alcançáveis por administrador da plataforma).
 *
 * Não é a mesma coisa que a conexão de Comercial → Conversas: lá cada
 * vendedor pareia o próprio aparelho. Os dois convivem.
 *
 * Não desaparece com o WhatsApp desligado — mostra o que falta em vez de
 * sumir, para não repetir o problema de quem procurava o pareamento e não
 * achava onde ligá-lo primeiro.
 */
export function InstitucionalConfig({ empresaId }: { empresaId?: string }) {
  const base = empresaId
    ? `/whatsapp/config/empresas/${empresaId}`
    : "/whatsapp/config";
  const sessaoUrl = `${base}/sessao-empresa`;
  const chaveCache = empresaId ?? "ativa";

  const { data: config, isLoading: carregandoConfig } = useQuery({
    queryKey: ["whatsapp", "config", chaveCache],
    queryFn: () => apiFetch<WhatsappConfig>(base),
  });

  const [ocupado, setOcupado] = useState(false);
  // null = ainda não mexeu no seletor; usa o padrão (sessão atual, ou da
  // empresa) até o admin escolher outro provedor explicitamente.
  const [transporteEscolhido, setTransporteEscolhido] =
    useState<WhatsappTransporte | null>(null);

  const { data: sessao, refetch } = useQuery({
    queryKey: ["whatsapp", "sessao-empresa", chaveCache],
    queryFn: () => apiFetch<SessaoEmpresa | null>(sessaoUrl),
    enabled: config?.ativo === true,
    // Enquanto pareia, o estado muda por fora (o worker avisa a API quando o
    // QR é lido): sem recarregar, a tela ficaria em "aguardando" para sempre.
    refetchInterval: (q) =>
      (q.state.data as SessaoEmpresa | null)?.status === "pareando" ? 3000 : false,
  });

  // O QR expira em segundos e o provedor renova: buscar uma vez só (como era)
  // deixava na tela um código já vencido. A rota devolve `qr` — o campo lido
  // antes era `qrCode`, que nunca existiu, e o código não aparecia com
  // provedor nenhum.
  const pareandoAgora = sessao?.status === "pareando";
  const {
    data: pareamento,
    error: erroPareamento,
    refetch: buscarQr,
  } = useQuery({
    queryKey: ["whatsapp", "pareamento-empresa", chaveCache],
    queryFn: () => apiFetch<WhatsappPareamento>(`${sessaoUrl}/pareamento`),
    enabled: config?.ativo === true && pareandoAgora,
    refetchInterval: 3000,
  });

  const qrImagem = useImagemQr(pareandoAgora ? pareamento?.qr : null);

  if (carregandoConfig || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4" /> Número institucional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

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

  const disponibilidade: Record<WhatsappTransporte, boolean> = {
    zapo: Boolean(config.workerUrl),
    evolution_go: Boolean(config.evolutionUrl && config.evolutionApiKeyDefinida),
    cloud_api: Boolean(
      config.cloudApiPhoneNumberId &&
        config.cloudApiBusinessAccountId &&
        config.cloudApiAccessTokenDefinida &&
        config.cloudApiAppSecretDefinida,
    ),
  };
  const transporte =
    transporteEscolhido ?? sessao?.transporte ?? config.transporte;

  const conectar = async () => {
    setOcupado(true);
    try {
      await apiFetch(`${sessaoUrl}/conectar`, {
        method: "POST",
        body: { transporte },
      });
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível iniciar o pareamento",
      );
    } finally {
      setOcupado(false);
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
      await apiFetch(sessaoUrl, { method: "DELETE" });
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
          Comercial → Conversas) — os dois convivem, inclusive em provedores
          diferentes.
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
          {sessao && (
            <Badge variant="outline">{WHATSAPP_TRANSPORTE_ROTULO[sessao.transporte]}</Badge>
          )}
        </div>

        {sessao?.ultimoErro && (
          <p className="text-xs text-destructive">{sessao.ultimoErro}</p>
        )}

        {status !== "conectada" && (
          <div className="space-y-2">
            <p className="text-xs font-medium">Provedor para este pareamento</p>
            <div className="flex flex-wrap gap-2">
              {PROVEDORES_ESCOLHIVEIS.map((p) => {
                const disponivel = disponibilidade[p];
                const selecionado = transporte === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!disponivel}
                    onClick={() => setTransporteEscolhido(p)}
                    title={
                      disponivel
                        ? undefined
                        : `${WHATSAPP_TRANSPORTE_ROTULO[p]} não está configurado — preencha a aba correspondente antes`
                    }
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      selecionado
                        ? "border-primary bg-primary/10 text-primary"
                        : disponivel
                          ? "hover:bg-muted"
                          : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    {WHATSAPP_TRANSPORTE_ROTULO[p]}
                    {!disponivel && " · não configurado"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {status === "pareando" && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Abra o WhatsApp do número da empresa → Aparelhos conectados →
              Conectar aparelho, e leia o código.
            </p>
            {qrImagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrImagem}
                alt="QR de pareamento"
                className="mx-auto size-56 rounded bg-white p-2"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> gerando o código...
              </div>
            )}
            {/* Sem isto, QR que não vem e QR que ainda vai chegar eram o mesmo
                "gerando o código..." girando para sempre. */}
            {!qrImagem && (pareamento?.erro || erroPareamento) ? (
              <p className="text-xs text-destructive">
                {pareamento?.erro ??
                  (erroPareamento instanceof ApiError
                    ? erroPareamento.message
                    : "Falha ao buscar o QR Code.")}
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void buscarQr()}
              className="w-full"
            >
              <QrCode className="size-4" /> Gerar novo código
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status !== "conectada" && (
            <Button onClick={conectar} disabled={ocupado || !disponibilidade[transporte]}>
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
