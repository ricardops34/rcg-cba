"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { AlertTriangle, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Antecedência a partir da qual o aviso passa a cobrar ação. */
const DIAS_DE_ALERTA = 30;

/**
 * Dias inteiros até o fim da avaliação, contando **dias de calendário**.
 *
 * Comparar os instantes daria "0 dias" para um prazo que termina hoje à noite
 * e "0 dias" para um que terminou de manhã — a pessoa leria a mesma coisa em
 * duas situações diferentes. Zerando as horas dos dois lados, hoje é 0, amanhã
 * é 1, e ontem é -1.
 */
function diasRestantes(iso: string, agora = new Date()): number {
  const fim = new Date(iso);
  const a = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const b = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function textoDoPrazo(dias: number): string {
  if (dias < 0) return "O período de avaliação terminou.";
  if (dias === 0) return "O período de avaliação termina hoje.";
  if (dias === 1) return "O período de avaliação termina amanhã.";
  return `O período de avaliação termina em ${dias} dias.`;
}

/**
 * Faixa que avisa que a empresa está em avaliação.
 *
 * Aparece durante todo o teste, não só perto do fim: quem entra num sistema em
 * avaliação precisa saber disso desde o primeiro dia — é o que explica por que
 * o acesso pode parar. A partir de 30 dias do vencimento ela muda de tom e
 * passa a contar os dias; nos últimos 7, fica em vermelho.
 *
 * Sai da empresa **ativa**, que já vem no `me()` — trocar de empresa troca o
 * aviso junto, sem requisição a mais. Mesmo caminho da faixa institucional.
 */
export function AvisoAvaliacao() {
  const user = useAuthStore((s) => s.user);
  const empresa = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  if (empresa?.situacao !== "teste") return null;

  // Avaliação sem prazo: avisa que é teste, mas não inventa contagem.
  if (!empresa.testeExpiraEm) {
    return (
      <Faixa tom="info" icone={<Info className="size-4 shrink-0" />}>
        Esta empresa está em <strong>período de avaliação</strong>.
      </Faixa>
    );
  }

  const dias = diasRestantes(empresa.testeExpiraEm);
  const vencido = dias < 0;
  const urgente = dias >= 0 && dias <= 7;
  const alertando = dias >= 0 && dias <= DIAS_DE_ALERTA;

  const tom = vencido || urgente ? "critico" : alertando ? "alerta" : "info";
  const icone =
    tom === "critico" ? (
      <AlertTriangle className="size-4 shrink-0" />
    ) : tom === "alerta" ? (
      <Clock className="size-4 shrink-0" />
    ) : (
      <Info className="size-4 shrink-0" />
    );

  return (
    <Faixa tom={tom} icone={icone}>
      <span>
        {vencido ? (
          <>
            <strong>Avaliação encerrada.</strong> O acesso será interrompido no
            próximo login.
          </>
        ) : (
          <>
            <strong>Período de avaliação.</strong> {textoDoPrazo(dias)}
          </>
        )}
      </span>
      {/* Só quem administra a plataforma tem o que fazer a respeito daqui — para
          os demais, o caminho é falar com o comercial, e um link para uma tela
          que devolveria 403 seria pior do que link nenhum. */}
      {user?.administradorPlataforma ? (
        <Link
          href="/plataforma/empresas"
          className="underline underline-offset-2 hover:no-underline"
        >
          Gerenciar
        </Link>
      ) : (
        <span className="opacity-80">
          Fale com o responsável comercial para liberar o acesso.
        </span>
      )}
    </Faixa>
  );
}

function Faixa({
  tom,
  icone,
  children,
}: {
  tom: "info" | "alerta" | "critico";
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-1.5 text-center text-xs sm:text-sm",
        tom === "info" &&
          "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
        tom === "alerta" &&
          "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
        tom === "critico" &&
          "bg-destructive/10 text-destructive dark:text-destructive-foreground dark:bg-destructive/30",
      )}
    >
      {icone}
      {children}
    </div>
  );
}
