"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SugestaoCompraCalculada } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { useLargurasColunas } from "@/components/crud/larguras-colunas";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type CampoSugestao = "codigoErp" | "descricao" | "motivo";

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
  onCalcular,
  calculando = false,
}: {
  data: SugestaoCompraCalculada | undefined;
  isLoading: boolean;
  isError: boolean;
  /** "Calcular agora" quando a lista está vazia (aba da Posição de Cliente). */
  onCalcular?: () => void;
  calculando?: boolean;
}) {
  // Busca, ordenação e larguras arrastáveis (16/11/2026), como no Mix.
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ campo: CampoSugestao | null; sentido: "asc" | "desc" }>({
    campo: null,
    sentido: "asc",
  });
  const colunas = useLargurasColunas("sugestao-compra:larguras", {
    codigo: 110,
    descricao: 320,
    motivo: 360,
  });
  const ordenar = (campo: CampoSugestao) =>
    setOrdem((a) =>
      a.campo === campo
        ? { campo, sentido: a.sentido === "asc" ? "desc" : "asc" }
        : { campo, sentido: "asc" },
    );

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a sugestão deste cliente.
      </p>
    );
  }
  if (!data || data.itens.length === 0) {
    // O motivo de verdade (sem CNAE, CPF, ainda não calculada) vem da API.
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {data?.aviso ?? "Nenhuma sugestão calculada para este cliente ainda."}
        </p>
        {onCalcular && (
          <Button type="button" size="sm" variant="outline" onClick={onCalcular} disabled={calculando}>
            {calculando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Calcular agora
          </Button>
        )}
      </div>
    );
  }

  const ultimoCalculo = dataHoraBr(data.ultimoCalculo);
  const termo = busca.trim().toLowerCase();
  const itens = data.itens
    .filter(
      (it) =>
        !termo ||
        it.codigoErp.toLowerCase().includes(termo) ||
        it.descricao.toLowerCase().includes(termo) ||
        (it.motivo ?? "").toLowerCase().includes(termo),
    )
    .sort((a, b) => {
      if (!ordem.campo) return 0;
      const va = a[ordem.campo] ?? "";
      const vb = b[ordem.campo] ?? "";
      if (!va) return vb ? 1 : 0;
      if (!vb) return -1;
      const c = String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return ordem.sentido === "asc" ? c : -c;
    });

  return (
    <div className="space-y-3">
      {ultimoCalculo && (
        <Badge variant="outline" className="font-normal">
          Calculado em {ultimoCalculo}
        </Badge>
      )}
      <Input
        placeholder="Buscar por código, descrição ou motivo..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sugestão corresponde à busca.</p>
      ) : (
        <Table className="table-fixed [&_td]:overflow-hidden [&_td]:text-ellipsis [&_th]:overflow-hidden" style={colunas.estiloTabela}>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Código"
                active={ordem.campo === "codigoErp"}
                order={ordem.sentido}
                onClick={() => ordenar("codigoErp")}
                style={{ width: colunas.larguras.codigo }}
                alca={colunas.alca("codigo")}
              />
              <SortableTableHead
                label="Produto"
                active={ordem.campo === "descricao"}
                order={ordem.sentido}
                onClick={() => ordenar("descricao")}
                style={{ width: colunas.larguras.descricao }}
                alca={colunas.alca("descricao")}
              />
              <SortableTableHead
                label="Por quê"
                active={ordem.campo === "motivo"}
                order={ordem.sentido}
                onClick={() => ordenar("motivo")}
                style={{ width: colunas.larguras.motivo }}
                alca={colunas.alca("motivo")}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((it) => (
              <TableRow key={it.produtoId}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {it.codigoErp}
                </TableCell>
                <TableCell className="whitespace-normal break-words">{it.descricao}</TableCell>
                <TableCell className="whitespace-normal break-words text-muted-foreground">
                  {it.motivo ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
