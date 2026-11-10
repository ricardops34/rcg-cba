"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
 * App no celular: instalar e ligar o aviso neste aparelho.
 *
 * Os avisos são os mesmos do sino (menos mensagem de WhatsApp, que tem o
 * ícone próprio), com texto curto — o detalhe só aparece dentro do app.
 */
export function AppCelularCard() {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-4 text-primary" />
          App no celular
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <BellRing className="size-4 text-muted-foreground" /> Avisos neste aparelho
          </h3>
          {isLoading || ligado === null ? (
            <Skeleton className="h-10 w-full" />
          ) : !config?.chavePublica ? (
            <p className="text-sm text-muted-foreground">
              O aviso no celular ainda não foi ativado no servidor.
            </p>
          ) : motivo && !ligado ? (
            <p className="text-sm text-muted-foreground">{motivo}</p>
          ) : (
            <>
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm">
                  Receber os avisos do sino neste aparelho
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
