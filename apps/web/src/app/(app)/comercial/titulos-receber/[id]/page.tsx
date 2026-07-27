"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { TituloReceber } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/titulos-receber";

type TituloDetalhe = TituloReceber & {
  cliente?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
};

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

// Detalhe read-only: os dados entram pelo import do ERP.
export default function TituloReceberDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: titulo, isLoading, isError } = useQuery({
    queryKey: ["titulos-receber", id],
    queryFn: () => apiFetch<TituloDetalhe>(`/titulos-receber/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !titulo) {
    return <p className="text-sm text-muted-foreground">Título não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {titulo.prefixo && `${titulo.prefixo}-`}
          {titulo.numero}
          {titulo.parcela && `/${titulo.parcela}`}
        </h1>
        {titulo.dtBaixa ? (
          <Badge variant="outline">Baixado {dataBr(titulo.dtBaixa)}</Badge>
        ) : (
          <Badge>Aberto</Badge>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Cliente" value={titulo.cliente?.razaoSocial ?? "—"} />
          <Info
            label="Vendedor"
            value={titulo.vendedor ? titulo.vendedor.nomeReduzido || titulo.vendedor.nome : "—"}
          />
          <Info label="Tipo" value={titulo.tipo || "—"} />
          <Info label="Forma de pagamento" value={titulo.formaPgto || "—"} />
          <Info label="Emissão" value={dataBr(titulo.emissao)} />
          <Info label="Vencimento" value={dataBr(titulo.vencimento)} />
          <Info label="Vencimento real" value={dataBr(titulo.vencimentoReal)} />
          <Info label="Data de baixa" value={dataBr(titulo.dtBaixa)} />
          <Info label="Valor" value={moeda(titulo.valor)} />
          <Info label="Saldo" value={moeda(titulo.saldo)} />
          <Info label="Acréscimo" value={moeda(titulo.acrescimo)} />
          <Info label="Decréscimo" value={moeda(titulo.decrescimo)} />
          {titulo.historico && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs text-muted-foreground">Histórico</p>
              <p className="text-sm">{titulo.historico}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
