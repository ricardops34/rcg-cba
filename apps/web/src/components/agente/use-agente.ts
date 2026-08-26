"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgenteApresentacao } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Quem é o agente e se ele está disponível para este usuário.
 *
 * Endpoint próprio (`/agente/apresentacao`), e não `/agente/config`: a
 * configuração inteira exige permissão de administrador, então o vendedor
 * tomava 403 e via "Assistente" genérico — mesmo com a empresa tendo batizado
 * o agente. Aqui a permissão é a de usar (`agente.visualizar`).
 *
 * Compartilhado entre a janela, o botão flutuante e o ícone da topbar: mesma
 * `queryKey`, então o React Query busca uma vez só.
 */
export function useAgente() {
  const podeUsar = useAuthStore((s) => s.hasPermission("agente", "visualizar"));

  const { data: config } = useQuery({
    queryKey: ["agente-apresentacao"],
    queryFn: () => apiFetch<AgenteApresentacao>("/agente/apresentacao"),
    enabled: podeUsar,
    retry: false,
  });

  const nomeAgente = config?.nomeAgente || "Assistente";

  return {
    /**
     * Só oferece o assistente para quem tem `agente.visualizar` **e** com o
     * agente ativo na empresa — não adianta um botão que vai responder erro.
     * Enquanto a apresentação não chega, vale a permissão: o ícone não pisca
     * na tela a cada carregamento.
     */
    disponivel: podeUsar && config?.ativo !== false,
    nomeAgente,
    boasVindas:
      config?.mensagemBoasVindas?.trim() ||
      `Olá! Sou o ${nomeAgente}. Posso consultar a sua carteira, montar orçamentos e preparar o seu dia. O que você precisa?`,
  };
}
