"use client";

import { useQuery } from "@tanstack/react-query";
import type { Assinatura } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { PlataformaGuard } from "../plataforma-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, DollarSign, Building2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

type AssinaturaRow = Assinatura & {
  empresa?: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
    situacao: string;
  };
  plano?: {
    id: string;
    nome: string;
    codigo: string;
    valorMensal: number;
  };
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function AssinaturasPage() {
  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ["plataforma-assinaturas-resumo"],
    queryFn: () =>
      apiFetch<{
        mrr: number;
        totalEmpresas: number;
        ativas: number;
        emTeste: number;
        inadimplentes: number;
      }>("/plataforma/assinaturas/resumo"),
  });

  const { data: assinaturas, isLoading: loadingAssinaturas } = useQuery({
    queryKey: ["plataforma-assinaturas-lista"],
    queryFn: () => apiFetch<AssinaturaRow[]>("/plataforma/assinaturas"),
  });

  const columns: ColumnDef<AssinaturaRow>[] = [
    {
      header: "Empresa",
      cell: (a) => (
        <div>
          <p className="font-medium text-foreground">{a.empresa?.nomeFantasia || a.empresa?.razaoSocial}</p>
          <p className="text-xs text-muted-foreground font-mono">{a.empresa?.cnpj}</p>
        </div>
      ),
    },
    {
      header: "Plano / Pacote",
      cell: (a) => <Badge variant="outline">{a.plano?.nome || "Sem plano"}</Badge>,
    },
    {
      header: "Ciclo",
      cell: (a) => <span className="capitalize text-xs">{a.ciclo}</span>,
    },
    {
      header: "Mensalidade",
      cell: (a) => (
        <span className="font-semibold text-primary">{moeda.format(a.valorMensalidade)}</span>
      ),
    },
    {
      header: "Vencimento",
      cell: (a) => <span className="text-xs">Dia {a.diaVencimento}</span>,
    },
    {
      header: "Situação",
      cell: (a) => {
        const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
          ativa: "default",
          teste: "secondary",
          atrasada: "destructive",
          suspensa: "destructive",
          cancelada: "outline",
        };
        return (
          <Badge variant={variants[a.situacao] || "outline"} className="capitalize">
            {a.situacao}
          </Badge>
        );
      },
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="size-6 text-primary" /> Assinaturas & Cobranças SaaS
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o faturamento recorrente (MRR), vigência de planos e situação financeira das empresas.
          </p>
        </div>

        {loadingResumo ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Receita Mensal (MRR)</CardTitle>
                <DollarSign className="size-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{moeda.format(resumo?.mrr || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Faturamento recorrente das empresas ativas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Empresas Ativas</CardTitle>
                <CheckCircle2 className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo?.ativas || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Com assinatura regular ativada</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em Período de Teste</CardTitle>
                <Clock className="size-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo?.emTeste || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Degustação / Período de avaliação</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes / Atrasadas</CardTitle>
                <AlertTriangle className="size-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{resumo?.inadimplentes || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Pendentes de pagamento ou suspensas</p>
              </CardContent>
            </Card>
          </div>
        )}

        <EntityTable
          columns={columns}
          rows={assinaturas || []}
          rowKey={(a) => a.id}
          isLoading={loadingAssinaturas}
          page={1}
          pageSize={100}
          total={(assinaturas || []).length}
          totalPages={1}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          emptyMessage="Nenhuma assinatura cadastrada."
        />
      </div>
    </PlataformaGuard>
  );
}
