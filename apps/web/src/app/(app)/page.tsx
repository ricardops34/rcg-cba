"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  Cake,
  Megaphone,
  Pin,
} from "lucide-react";
import type {
  Aniversariante,
  ComunicadoMural,
  StatusIntegracao,
} from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api-client";
import { AtalhosInicio } from "@/components/inicio/atalhos-inicio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function saudacao(hora: number) {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function formatarDataHora(isoString: string | null | undefined) {
  if (!isoString) return "Não registrada";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Não registrada";

  const dataStr = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dataStr} às ${horaStr}`;
}

export default function InicioPage() {
  const user = useAuthStore((s) => s.user);
  const statusIntegracaoQuery = useQuery({
    queryKey: ["inicio", "status-integracao"],
    queryFn: () => apiFetch<StatusIntegracao>("/inicio/status-integracao"),
    refetchInterval: 30_000,
  });

  const muralQuery = useQuery({
    queryKey: ["inicio", "mural"],
    queryFn: () => apiFetch<ComunicadoMural[]>("/inicio/mural"),
  });

  const aniversariantesQuery = useQuery({
    queryKey: ["inicio", "aniversariantes"],
    queryFn: () => apiFetch<Aniversariante[]>("/inicio/aniversariantes"),
  });

  const agora = new Date();
  const hoje = agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {saudacao(agora.getHours())}, {user?.nome.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground first-letter:uppercase">{hoje}</p>
        </div>

        {/* No celular a faixa do ERP vai para o fim da página: é informação de
            suporte, e não deve empurrar os atalhos para baixo. */}
        <StatusIntegracaoCard
          className="hidden sm:flex"
          status={statusIntegracaoQuery.data}
          carregando={statusIntegracaoQuery.isLoading}
        />
      </div>

      <AtalhosInicio />

      <div className="grid gap-6 lg:grid-cols-3">
        <Mural
          comunicados={muralQuery.data}
          carregando={muralQuery.isLoading}
        />
        <Aniversarios
          lista={aniversariantesQuery.data}
          carregando={aniversariantesQuery.isLoading}
        />
      </div>

      <StatusIntegracaoCard
        className="sm:hidden"
        status={statusIntegracaoQuery.data}
        carregando={statusIntegracaoQuery.isLoading}
      />
    </div>
  );
}

function StatusIntegracaoCard({
  status,
  carregando,
  className,
}: {
  status: StatusIntegracao | undefined;
  carregando: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 rounded-xl border bg-card p-3.5 shadow-xs text-xs sm:flex sm:flex-wrap sm:items-center",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 sm:border-r sm:border-border/60 sm:pr-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shrink-0">
          <ArrowDownToLine className="size-4" />
        </div>
        <div>
          <span className="font-medium text-muted-foreground block">
            Última Coleta ERP
          </span>
          <span className="font-semibold text-foreground">
            {carregando ? (
              <Skeleton className="h-3.5 w-28 mt-0.5 inline-block" />
            ) : (
              formatarDataHora(status?.ultimaColeta)
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:border-r sm:border-border/60 sm:pr-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 shrink-0">
          <ArrowUpFromLine className="size-4" />
        </div>
        <div>
          <span className="font-medium text-muted-foreground block">
            Último Envio ERP
          </span>
          <span className="font-semibold text-foreground">
            {carregando ? (
              <Skeleton className="h-3.5 w-28 mt-0.5 inline-block" />
            ) : (
              formatarDataHora(status?.ultimoEnvio)
            )}
          </span>
        </div>
      </div>

      {/* Informada pelo próprio ERP no fim de cada execução de envio ou retorno
          (parâmetro ULTIMA_COMUNICACAO_ERP). */}
      <div className="flex items-center gap-2.5 sm:pl-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 shrink-0">
          <ArrowUpDown className="size-4" />
        </div>
        <div>
          <span className="font-medium text-muted-foreground block">
            Última Comunicação ERP
          </span>
          <span className="font-semibold text-foreground">
            {carregando ? (
              <Skeleton className="h-3.5 w-28 mt-0.5 inline-block" />
            ) : (
              formatarDataHora(status?.ultimaComunicacao)
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Mural({
  comunicados,
  carregando,
}: {
  comunicados: ComunicadoMural[] | undefined;
  carregando: boolean;
}) {
  return (
    <Card className="lg:col-span-2" data-tour="comunicados">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-muted-foreground" />
          Comunicados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : !comunicados?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum comunicado no momento.
          </p>
        ) : (
          comunicados.map((c) => (
            <article
              key={c.id}
              className={cn(
                "rounded-md border p-3",
                c.fixado && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">{c.titulo}</h3>
                {c.fixado && (
                  <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                )}
              </div>
              {/* `whitespace-pre-line` porque o texto é digitado num textarea:
                  as quebras que quem escreveu colocou são o único formato que
                  ele tem. */}
              <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                {c.texto}
              </p>
              <p className="mt-2 text-xs text-muted-foreground/70">
                {new Date(c.publicadoEm).toLocaleDateString("pt-BR")}
              </p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Aniversarios({
  lista,
  carregando,
}: {
  lista: Aniversariante[] | undefined;
  carregando: boolean;
}) {
  return (
    <Card data-tour="aniversariantes">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cake className="size-4 text-muted-foreground" />
          Aniversariantes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {carregando ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        ) : !lista?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ninguém faz aniversário nos próximos 30 dias.
          </p>
        ) : (
          lista.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                a.emDias === 0 && "bg-primary/10",
              )}
            >
              <span className="truncate text-sm">{a.nome}</span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  a.emDias === 0
                    ? "font-medium text-primary"
                    : "text-muted-foreground",
                )}
              >
                {a.emDias === 0
                  ? "hoje 🎉"
                  : `${String(a.dia).padStart(2, "0")}/${String(a.mes).padStart(2, "0")}`}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
