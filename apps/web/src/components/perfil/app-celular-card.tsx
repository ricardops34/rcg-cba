"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  assinarInstalacao,
  assinaturaAtual,
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

  // Só ativar: os avisos são função importante do sistema e não têm opção de
  // desligar (decisão do usuário, 2026-11-10). Bloquear nas configurações do
  // navegador continua possível — isso não depende de nós, e a faixa do topo
  // (FaixaAtivarAvisos) cobra a liberação.
  async function ativar() {
    if (!config?.chavePublica) return;
    setOcupado(true);
    try {
      await ligarPush(config.chavePublica);
      toast.success(celular ? "Notificações do celular ativadas." : "Notificações do navegador ativadas.");
      setLigado(true);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ativar as notificações.");
      setMotivo(motivoSemPush());
    } finally {
      setOcupado(false);
    }
  }

  async function teste() {
    setOcupado(true);
    try {
      const enviados = await testarPush();
      if (enviados > 0) toast.success("Notificação de teste enviada. Ela chega em alguns segundos.");
      else toast.warning("A notificação de teste não chegou a nenhum aparelho. Recarregue a página e tente de novo.");
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
          {celular ? "App no celular" : "Notificações do navegador"}
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
              <BellRing className="size-4 text-muted-foreground" /> Notificações do celular
            </h3>
          )}
          {isLoading || ligado === null ? (
            <Skeleton className="h-10 w-full" />
          ) : semAviso ? (
            <p className="text-sm text-muted-foreground">
              As notificações do celular ainda não estão disponíveis.
            </p>
          ) : motivo && !ligado ? (
            <p className="text-sm text-muted-foreground">{motivo}</p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm">
                  {ligado ? (
                    <span className="flex items-center gap-1.5 font-medium text-success">
                      <Check className="size-4" /> Notificações{" "}
                      {celular ? "do celular" : "do navegador"} ativas
                    </span>
                  ) : celular ? (
                    "Ative para receber os avisos do sino como notificação do celular."
                  ) : (
                    "Ative para receber os avisos do sino como notificação do navegador, mesmo com o sistema em outra aba."
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Desconto a liberar, orçamento aprovado, agenda, recados e o resto do sino.
                  Mensagem de WhatsApp não entra.
                </p>
              </div>
              {!ligado && (
                <Button
                  type="button"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => void ativar()}
                >
                  Ativar notificações
                </Button>
              )}
              {ligado && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => void teste()}
                >
                  Enviar notificação de teste
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                As notificações param quando você sai do sistema neste aparelho ou fora do seu horário
                de trabalho, e voltam sozinhas quando você entra de novo.
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
