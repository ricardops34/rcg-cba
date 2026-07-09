"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Indicador {
  resource: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  permissao: string;
  gradient: string;
}

const INDICADORES: Indicador[] = [
  {
    resource: "empresas",
    href: "/admin/empresas",
    title: "Empresas",
    description: "Empresas do grupo",
    icon: Building2,
    permissao: "empresas.visualizar",
    gradient: "from-blue-600 to-blue-700",
  },
  {
    resource: "usuarios",
    href: "/admin/usuarios",
    title: "Usuários",
    description: "Contas de acesso",
    icon: Users,
    permissao: "usuarios.visualizar",
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    resource: "perfis",
    href: "/admin/perfis",
    title: "Perfis",
    description: "Papéis e permissões",
    icon: ShieldCheck,
    permissao: "perfis.visualizar",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    resource: "colaboradores",
    href: "/comercial/vendedores",
    title: "Colaboradores",
    description: "Hierarquia comercial",
    icon: UserRound,
    permissao: "colaboradores.visualizar",
    gradient: "from-cyan-500 to-cyan-700",
  },
];

function KpiCard({ indicador }: { indicador: Indicador }) {
  const { data: total, isLoading } = useQuery({
    queryKey: [indicador.resource, "count"],
    queryFn: () =>
      apiFetch<{ total: number }>(`/${indicador.resource}`, { query: { page: 1, pageSize: 1 } }),
    select: (d) => d.total,
  });

  return (
    <Link href={indicador.href}>
      <div
        className={`group relative overflow-hidden rounded-xl bg-linear-to-br p-4 text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg ${indicador.gradient}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-white/10 blur-xl"
        />
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold tracking-wider uppercase opacity-90">{indicador.title}</p>
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/20">
            <indicador.icon className="size-4.5" />
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-16 bg-white/25" />
        ) : (
          <p className="mt-1 text-3xl font-bold tracking-tight">{total ?? "—"}</p>
        )}
        <p className="mt-0.5 text-xs opacity-80">{indicador.description}</p>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore();

  const visiveis = INDICADORES.filter((i) =>
    hasPermission(i.permissao.split(".")[0], i.permissao.split(".")[1]),
  );

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {user?.nome.split(" ")[0]}</h1>
        <p className="text-muted-foreground first-letter:uppercase">{hoje}</p>
      </div>

      {visiveis.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visiveis.map((i) => (
            <KpiCard key={i.resource} indicador={i} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Acesso rápido
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visiveis.map((atalho) => (
            <Link key={atalho.href} href={atalho.href}>
              <Card className="group h-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/30">
                <CardHeader>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <atalho.icon className="size-5" />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <CardTitle className="text-base">{atalho.title}</CardTitle>
                  <CardDescription>{atalho.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
