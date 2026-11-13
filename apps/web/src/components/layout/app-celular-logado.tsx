"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, X } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { ehIos, estaInstalado, obterConfigPush, religarPush } from "@/lib/app-celular";

const CHAVE_CONVITE = "plataforma-convite-app-dispensado";

/**
 * O que o app no celular precisa a cada entrada no sistema:
 *
 * - **religar o aviso**: a assinatura do aparelho ficou presa à sessão do
 *   login anterior, que foi encerrada; sem reapontar, o aviso não sai mais;
 * - **convidar a instalar**: no iPhone, quem usa pelo Safari sem instalar não
 *   recebe aviso nenhum. A faixa aparece só no celular, fora do app instalado,
 *   e some de vez quando dispensada.
 */
export function AppCelularLogado() {
  const usuarioId = useAuthStore((s) => s.user?.id);
  const personificando = useAuthStore((s) => Boolean(s.user?.personificacao));
  const isMobile = useIsMobile();
  const [convite, setConvite] = useState(false);
  // No iPhone, com o aviso no ar, quem convida a instalar é a FaixaAtivarAvisos
  // (que não se dispensa): duas faixas dizendo a mesma coisa só confundem.
  const { data: config } = useQuery({
    queryKey: ["push", "config"],
    queryFn: obterConfigPush,
    staleTime: 5 * 60_000,
  });
  const faixaCobreIos = ehIos() && Boolean(config?.chavePublica);

  useEffect(() => {
    if (!usuarioId || personificando) return;
    void religarPush().catch(() => undefined);
  }, [usuarioId, personificando]);

  useEffect(() => {
    if (!isMobile || estaInstalado() || faixaCobreIos) {
      setConvite(false);
      return;
    }
    try {
      setConvite(localStorage.getItem(CHAVE_CONVITE) !== "1");
    } catch {
      setConvite(true);
    }
  }, [isMobile, faixaCobreIos]);

  if (!convite || personificando) return null;

  const dispensar = () => {
    setConvite(false);
    try {
      localStorage.setItem(CHAVE_CONVITE, "1");
    } catch {
      // Sem armazenamento, a faixa só volta na próxima abertura.
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-3 py-2 text-xs text-foreground">
      <Smartphone className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        Instale o app para abrir pelo ícone e receber os avisos no celular.{" "}
        <Link href="/perfil#notificacoes" onClick={dispensar} className="font-semibold text-primary underline">
          Ver como
        </Link>
      </span>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-primary/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
