"use client";

import { useAuthStore } from "@/stores/auth-store";
import { UserCog } from "lucide-react";

/**
 * Faixa da sessão de personificação ("Testar como este usuário", cadastro de
 * Usuários): aparece só nesta aba (o estado vive isolado em `sessionStorage`,
 * ver `ativarArmazenamentoDaAba`). Sair fecha a aba — não há sessão de
 * verdade para encerrar no servidor (sem refresh token), e chamar
 * `/auth/logout` aqui arriscaria encerrar a sessão do administrador, se o
 * cookie dele estiver presente no mesmo navegador.
 */
export function AvisoPersonificacao() {
  const { user, encerrarAba } = useAuthStore();
  const personificacao = user?.personificacao;
  if (!personificacao) return null;

  const sair = () => {
    encerrarAba();
    window.close();
    // Só chega aqui se o navegador recusar fechar a aba (não foi aberta por
    // script, ex.: digitou a URL à mão) — sem sessão, a navegação cai no login.
    setTimeout(() => window.location.assign("/login"), 150);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-sky-600/30 bg-sky-500 px-4 py-1.5 text-xs font-medium text-sky-950 dark:bg-sky-900/90 dark:text-sky-100">
      <UserCog className="size-4 shrink-0" />
      <span>
        <strong>Testando como {user?.nome}</strong> — aberto por{" "}
        {personificacao.administradorNome}. Expira sozinho em até 15 min; toda ação fica
        registrada no log de auditoria.
      </span>
      <button
        type="button"
        onClick={sair}
        className="rounded border border-sky-950/40 px-2 py-0.5 font-semibold hover:bg-sky-950/10 dark:border-sky-100/40 dark:hover:bg-sky-100/10"
      >
        Fechar esta aba
      </button>
    </div>
  );
}
