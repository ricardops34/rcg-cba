"use client";

import Link from "next/link";
import { Building2, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ATALHOS = [
  {
    href: "/admin/empresas",
    title: "Empresas",
    description: "Cadastro das empresas do grupo",
    icon: Building2,
    permissao: "empresas.visualizar",
  },
  {
    href: "/admin/usuarios",
    title: "Usuários",
    description: "Contas de acesso ao sistema",
    icon: Users,
    permissao: "usuarios.visualizar",
  },
  {
    href: "/admin/perfis",
    title: "Perfis",
    description: "Papéis e permissões (RBAC)",
    icon: ShieldCheck,
    permissao: "perfis.visualizar",
  },
  {
    href: "/comercial/colaboradores",
    title: "Colaboradores",
    description: "Vendedores e hierarquia comercial",
    icon: UserRound,
    permissao: "colaboradores.visualizar",
  },
];

export default function DashboardPage() {
  const { user, hasPermission } = useAuthStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {user?.nome.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Acesse os cadastros base do sistema abaixo.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ATALHOS.filter((a) => hasPermission(a.permissao.split(".")[0], a.permissao.split(".")[1])).map(
          (atalho) => (
            <Link key={atalho.href} href={atalho.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <atalho.icon className="size-5 text-primary" />
                  <CardTitle className="text-base">{atalho.title}</CardTitle>
                  <CardDescription>{atalho.description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
