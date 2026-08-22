"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Cake,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Package,
  Pin,
  Receipt,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Aniversariante, ComunicadoMural } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Atalho {
  href: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  /** `rotina.acao` — a mesma string do RBAC. */
  permissao: string;
}

/**
 * Atalhos da tela inicial: lista curada, filtrada pela permissão de cada um.
 *
 * Curada e não automática (o menu lateral já lista tudo): aqui cabem oito
 * cartões, e a graça é serem as telas do dia a dia. A ordem é a do trabalho de
 * um vendedor — quem ele atende, o que vende, o que precisa cobrar —, não a
 * ordem do menu.
 */
const ATALHOS: Atalho[] = [
  {
    href: "/comercial/atendimento",
    titulo: "Atendimento",
    descricao: "Conversas de WhatsApp",
    icone: MessageCircle,
    permissao: "whatsapp-conversas.visualizar",
  },
  {
    href: "/comercial/posicao-cliente",
    titulo: "Posição de Cliente",
    descricao: "Carteira, compras e títulos",
    icone: Users,
    permissao: "posicao-cliente.visualizar",
  },
  {
    href: "/crm/orcamentos",
    titulo: "Orçamentos",
    descricao: "Propostas em aberto",
    icone: FileText,
    permissao: "orcamentos.visualizar",
  },
  {
    href: "/crm/agenda",
    titulo: "Agenda",
    descricao: "Compromissos e visitas",
    icone: CalendarDays,
    permissao: "agenda.visualizar",
  },
  {
    href: "/crm/atividades",
    titulo: "Atividades",
    descricao: "Tarefas e follow-up",
    icone: ClipboardList,
    permissao: "atividades.visualizar",
  },
  {
    href: "/comercial/titulos-receber",
    titulo: "Títulos a Receber",
    descricao: "Cobrança e vencimentos",
    icone: Receipt,
    permissao: "titulos-receber.visualizar",
  },
  {
    href: "/comercial/dashboard",
    titulo: "Dashboard",
    descricao: "Vendas do período",
    icone: LayoutDashboard,
    permissao: "dashboard-comercial.visualizar",
  },
  {
    href: "/comercial/produtos",
    titulo: "Produtos",
    descricao: "Catálogo e preços",
    icone: Package,
    permissao: "produtos.visualizar",
  },
  {
    href: "/consultas/sugestao-compra",
    titulo: "Sugestão de Compra",
    descricao: "O que oferecer a cada cliente",
    icone: ShoppingCart,
    permissao: "sugestao-compra.visualizar",
  },
  {
    href: "/crm/oportunidades",
    titulo: "Oportunidades",
    descricao: "Funil de vendas",
    icone: TrendingUp,
    permissao: "oportunidades.visualizar",
  },
  {
    href: "/gerencial/objetivos",
    titulo: "Objetivos",
    descricao: "Metas por vendedor",
    icone: Target,
    permissao: "objetivos.visualizar",
  },
  {
    href: "/gerencial/dashboard",
    titulo: "Dashboard Gerencial",
    descricao: "Resultado da equipe",
    icone: LayoutDashboard,
    permissao: "dashboard-gerencial.visualizar",
  },
];

/** Quantos atalhos cabem sem a tela virar um segundo menu. */
const MAX_ATALHOS = 8;

function saudacao(hora: number) {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default function InicioPage() {
  const user = useAuthStore((s) => s.user);
  const permissoes = user?.permissoes;

  const visiveis = ATALHOS.filter((a) =>
    permissoes?.includes(a.permissao),
  ).slice(0, MAX_ATALHOS);

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {saudacao(agora.getHours())}, {user?.nome.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground first-letter:uppercase">{hoje}</p>
      </div>

      {visiveis.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Acesso rápido
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visiveis.map((atalho) => (
              <Link key={atalho.href} href={atalho.href}>
                <Card className="group h-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/30">
                  <CardHeader>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <atalho.icone className="size-5" />
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <CardTitle className="text-base">{atalho.titulo}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {atalho.descricao}
                    </p>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

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
    <Card className="lg:col-span-2">
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
    <Card>
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
