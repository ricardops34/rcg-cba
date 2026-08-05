"use client";

import { useQuery } from "@tanstack/react-query";
import type { TituloReceber } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { TituloStatusBadge } from "@/components/comercial/titulo-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";

export type TituloReceberDetalhe = TituloReceber & {
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

/** Corpo do detalhe de um título a receber — usado tanto na página cheia quanto na cortina. */
export function TituloReceberDetalheContent({ titulo }: { titulo: TituloReceberDetalhe }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Info label="Status" value={<TituloStatusBadge status={titulo.status} />} />
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
  );
}

/**
 * Cortina lateral com o detalhe do título — usada dentro da Posição de
 * Cliente pra não perder a busca/scroll/aba de quem está consultando.
 */
export function TituloReceberSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: titulo, isLoading, isError } = useQuery({
    queryKey: ["titulos-receber", id],
    queryFn: () => apiFetch<TituloReceberDetalhe>(`/titulos-receber/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={520}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {titulo ? (
              <>
                {titulo.prefixo && `${titulo.prefixo}-`}
                {titulo.numero}
                {titulo.parcela && `/${titulo.parcela}`}
                <TituloStatusBadge status={titulo.status} />
              </>
            ) : (
              "Título a receber"
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Título não encontrado.</p>}
          {titulo && <TituloReceberDetalheContent titulo={titulo} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
