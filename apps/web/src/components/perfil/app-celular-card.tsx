"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  assinarInstalacao,
  assinaturaAtual,
  desligarPush,
  ehIos,
  estaInstalado,
  instalar,
  ligarPush,
  motivoSemPush,
  obterConfigPush,
  podeInstalar,
  testarPush,
} from "@/lib/app-celular";

/**
 * Aviso do sino fora da tela, onde a pessoa estiver usando o sistema — no
 * computador e no celular (decisão de 2026-11-10). Cada aparelho liga o seu:
 * o navegador só dá a permissão com um toque da própria pessoa.
 *
 * No celular o cartão também ensina a instalar o app; no computador, não.
 *
 * Os avisos são os mesmos do sino (menos mensagem de WhatsApp, que tem o
 * ícone próprio), com texto curto — o detalhe só aparece dentro do app.
 */
export function AppCelularCard() {
  const celular = useIsMobile();
  const instalavel = useSyncExternalStore(assinarInstalacao, podeInstalar, () => false);
  const [instalado, setInstalado] = useState(false);
  const [ios, setIos] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["push", "config"],
    queryFn: obterConfigPush,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    // Tudo isso só existe no navegador; ler na montagem evita divergência com
    // o HTML do servidor.
    setInstalado(estaInstalado());
    setIos(ehIos());
    setMotivo(motivoSemPush());
    void assinaturaAtual()
      .then((s) => setLigado(Boolean(s)))
      .catch(() => setLigado(false));
  }, []);

  async function alternar(valor: boolean) {
    if (!config?.chavePublica) return;
    setOcupado(true);
    try {
      if (valor) {
        await ligarPush(config.chavePublica);
        toast.success("Aviso ligado neste aparelho.");
      } else {
        await desligarPush();
        toast.success("Aviso desligado neste aparelho.");
      }
      setLigado(valor);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar o aviso.");
      setMotivo(motivoSemPush());
    } finally {
      setOcupado(false);
    }
  }

  async function teste() {
    setOcupado(true);
    try {
      const enviados = await testarPush();
      if (enviados > 0) toast.success("Aviso de teste enviado. Ele chega em alguns segundos.");
      else toast.warning("Nenhum aparelho apto recebeu. Desligue e ligue o aviso de novo.");
    } catch {
      toast.error("Não foi possível enviar o teste.");
    } finally {
      setOcupado(false);
    }
  }

  async function instalarAgora() {
    const aceito = await instalar();
    if (aceito) setInstalado(true);
  }

  // Sem as chaves do aviso na stack (ver o runbook, "Chaves do aviso no
  // celular"), no computador não há nada a oferecer: o cartão some em vez de
  // mostrar um recado técnico. No celular a parte de instalar continua.
  const semAviso = !isLoading && !config?.chavePublica;
  if (!celular && semAviso) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {celular ? (
            <Smartphone className="size-4 text-primary" />
          ) : (
            <BellRing className="size-4 text-primary" />
          )}
          {celular ? "App no celular" : "Avisos neste navegador"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {celular && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Instalar</h3>
            {instalado ? (
              <p className="text-sm text-muted-foreground">
                Você está usando o app instalado.
              </p>
            ) : instalavel ? (
              <Button type="button" onClick={instalarAgora} className="min-h-11 w-full sm:w-auto">
                <Download /> Instalar app
              </Button>
            ) : ios ? (
              <p className="text-sm text-muted-foreground">
                No Safari, toque em <strong>Compartilhar</strong> e depois em{" "}
                <strong>Adicionar à Tela de Início</strong>. O sistema passa a abrir pelo ícone,
                em tela cheia.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No menu do navegador, escolha <strong>Instalar app</strong> ou{" "}
                <strong>Adicionar à tela inicial</strong>.
              </p>
            )}
          </section>
        )}

        <section className="space-y-2">
          {/* No celular o cartão tem duas partes (instalar e avisos); no
              computador o título do cartão já diz o que é. */}
          {celular && (
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <BellRing className="size-4 text-muted-foreground" /> Avisos
            </h3>
          )}
          {isLoading || ligado === null ? (
            <Skeleton className="h-10 w-full" />
          ) : semAviso ? (
            <p className="text-sm text-muted-foreground">
              Os avisos no celular ainda não estão disponíveis.
            </p>
          ) : motivo && !ligado ? (
            <p className="text-sm text-muted-foreground">{motivo}</p>
          ) : (
            <>
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm">
                  {celular
                    ? "Receber os avisos do sino neste aparelho"
                    : "Receber os avisos do sino neste navegador, mesmo com o sistema em outra aba"}
                  <span className="block text-xs text-muted-foreground">
                    Desconto a liberar, orçamento aprovado, agenda, recados e o resto do sino.
                    Mensagem de WhatsApp não entra.
                  </span>
                </span>
                <Switch
                  checked={ligado}
                  disabled={ocupado}
                  onCheckedChange={(v) => void alternar(v)}
                  aria-label="Receber avisos neste aparelho"
                />
              </label>
              {ligado && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => void teste()}
                >
                  Enviar aviso de teste
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                O aviso para quando você sai do sistema neste aparelho ou fora do seu horário de
                trabalho, e volta sozinho quando você entra de novo.
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
