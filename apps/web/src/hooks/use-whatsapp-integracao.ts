"use client";

import { useQuery } from "@tanstack/react-query";
import type { WhatsappIntegracao } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Rotinas que só existem com o WhatsApp ligado. Quando a integração está
 * desligada, valem como se o usuário não tivesse permissão: somem do menu e
 * dos atalhos da tela inicial.
 *
 * `whatsapp-config` fica de fora de propósito — é a tela onde se liga a
 * integração; escondê-la deixaria o administrador sem por onde religar.
 */
export const ROTINAS_DEPENDENTES_WHATSAPP = ["whatsapp-conversas"];

/**
 * Se o WhatsApp está ativo na empresa da sessão.
 *
 * Devolve `undefined` enquanto a resposta não chegou: quem usa deve tratar o
 * desconhecido como desligado — é melhor o item de Atendimento aparecer um
 * instante depois do que piscar na tela de quem não tem a integração.
 */
export function useWhatsappIntegracao() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ["whatsapp", "integracao"],
    queryFn: () => apiFetch<WhatsappIntegracao>("/whatsapp/integracao"),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  return { ativo: query.data?.ativo, isLoading: query.isLoading };
}
