"use client";

import { useQuery } from "@tanstack/react-query";
import type { SugestaoCompraCalculada } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";

const dataHoraBr = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("pt-BR");
};

/**
 * Tabela do que está **gravado** em `sugestoes_compra` para um cliente — não
 * um cálculo ao vivo. Usada pela ação "Visualizar" da listagem e pela aba de
 * Sugestão na Posição de Cliente: as duas precisam mostrar exatamente a
 * mesma coisa, então o markup vive aqui uma vez só.
 */
export function SugestaoCompraCalculadaTabela({
  data,
  isLoading,
  isError,
}: {
  data: SugestaoCompraCalculada | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a sugestão deste cliente.
      </p>
    );
  }
  if (!data || data.itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma sugestão calculada para este cliente ainda. Use a ação
        &quot;Calcular&quot; para gerar.
      </p>
    );
  }

  const ultimoCalculo = dataHoraBr(data.ultimoCalculo);

  return (
    <div className="space-y-3">
      {ultimoCalculo && (
        <Badge variant="outline" className="font-normal">
          Calculado em {ultimoCalculo}
        </Badge>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Produto</th>
              <th className="py-1.5 font-medium">Por quê</th>
            </tr>
          </thead>
          <tbody>
            {data.itens.map((it) => (
              <tr key={it.produtoId} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <div className="font-mono text-xs text-muted-foreground">{it.codigoErp}</div>
                  <div>{it.descricao}</div>
                </td>
                <td className="py-2 text-muted-foreground">{it.motivo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Painel lateral com a sugestão já calculada de um cliente — não dispara cálculo. */
export function SugestaoCompraCalculadaSheet({
  clienteId,
  razaoSocial,
  onOpenChange,
}: {
  clienteId: string | null;
  razaoSocial?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sugestao-compra", "calculada", clienteId],
    queryFn: () =>
      apiFetch<SugestaoCompraCalculada>(`/sugestao-compra/cliente/${clienteId}/calculada`),
    enabled: !!clienteId,
  });

  return (
    <Sheet open={!!clienteId} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={560}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lightbulb className="size-4" />
            Sugestão de compra
            {(data?.razaoSocial ?? razaoSocial) ? ` — ${data?.razaoSocial ?? razaoSocial}` : ""}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <SugestaoCompraCalculadaTabela data={data} isLoading={isLoading} isError={isError} />
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
