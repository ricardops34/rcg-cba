"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  assinaturaAtual,
  ehIos,
  estaInstalado,
  ligarPush,
  motivoSemPush,
  obterConfigPush,
  pushSuportado,
} from "@/lib/app-celular";

type Situacao = "ativo" | "ativar" | "bloqueado" | "instalar" | "sem-suporte";

async function situacaoDoAparelho(): Promise<Situacao> {
  if (ehIos() && !estaInstalado()) return "instalar";
  if (!pushSuportado()) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  return (await assinaturaAtual()) ? "ativo" : "ativar";
}

/**
 * Cobra a ativação do aviso do sino no aparelho em uso (decisão de
 * 2026-11-10: os avisos são função importante do sistema). Não tem
 * "dispensar": some só quando o aviso fica ativo neste aparelho.
 *
 * Obrigatório de verdade não dá para ser — o navegador só libera notificação
 * com o toque da própria pessoa, e ela pode bloquear nas configurações dele a
 * qualquer hora. Por isso a faixa também cobre o "bloqueado", explicando como
 * liberar, e confere de novo quando a pessoa volta para a aba.
 *
 * Fora do ar enquanto a stack não tem as chaves VAPID (cobrar um aviso que
 * não sai seria pior que não cobrar) e na personificação (o aparelho é do
 * administrador, não do usuário testado).
 */
export function FaixaAtivarAvisos() {
  const personificando = useAuthStore((s) => Boolean(s.user?.personificacao));
  // No celular o aviso é a notificação do celular; no computador, a do navegador.
  const celular = useIsMobile();
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["push", "config"],
    queryFn: obterConfigPush,
    staleTime: 5 * 60_000,
  });
  const chavePublica = config?.chavePublica ?? null;

  const conferir = useCallback(() => {
    void situacaoDoAparelho()
      .then(setSituacao)
      .catch(() => setSituacao(null));
  }, []);

  useEffect(() => {
    if (!chavePublica || personificando) return;
    conferir();
    // Quem liberou o aviso nas configurações do navegador e voltou para a aba
    // não precisa recarregar a página para a faixa sumir.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [chavePublica, personificando, conferir]);

  if (!chavePublica || personificando) return null;
  if (!situacao || situacao === "ativo" || situacao === "sem-suporte") return null;

  async function ativar() {
    if (!chavePublica) return;
    setOcupado(true);
    try {
      await ligarPush(chavePublica);
      toast.success(
        celular ? "Notificações do celular ativadas." : "Notificações do navegador ativadas.",
      );
      setSituacao("ativo");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ativar os avisos.");
      conferir();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-foreground">
      <BellRing className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">
        {situacao === "ativar" ? (
          <>
            <strong>
              {celular ? "Ative as notificações do celular" : "Ative as notificações do navegador"}
            </strong>{" "}
            para não perder liberação de desconto, orçamento aprovado e os outros avisos do sino.
          </>
        ) : situacao === "bloqueado" ? (
          celular ? (
            <>
              <strong>As notificações do celular estão bloqueadas para este site.</strong> Libere
              nas configurações de notificações do celular e volte para o sistema.
            </>
          ) : (
            <>
              <strong>As notificações do navegador estão bloqueadas para este site.</strong>{" "}
              Clique no cadeado ao lado do endereço, permita as notificações e volte para esta aba.
            </>
          )
        ) : (
          <>
            {motivoSemPush()}{" "}
            <Link href="/perfil#conta" className="font-semibold text-primary underline">
              Ver como
            </Link>
          </>
        )}
      </span>
      {situacao === "ativar" && (
        <Button type="button" size="sm" className="h-8" disabled={ocupado} onClick={() => void ativar()}>
          Ativar notificações
        </Button>
      )}
    </div>
  );
}
