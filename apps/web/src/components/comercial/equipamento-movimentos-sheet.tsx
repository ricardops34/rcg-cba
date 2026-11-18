"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  PosicaoClienteEquipamento,
  PosicaoClienteEquipamentoMovimento,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function TipoBadge({ tipo }: { tipo: PosicaoClienteEquipamentoMovimento["tipo"] }) {
  return tipo === "remessa" ? (
    <Badge variant="outline" className="border-sky-500/40 text-sky-700 dark:text-sky-400">
      Remessa
    </Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
      Retorno
    </Badge>
  );
}

/**
 * Cortina de detalhe do equipamento na aba Equipamentos (pedido de
 * 17/11/2026): o equipamento no topo e, embaixo, os itens das notas em que ele
 * foi ao cliente (remessa) e voltou (retorno). Clique na nota abre a nota
 * completa em outra cortina; lá, o clique no item abre o produto.
 */
export function EquipamentoMovimentosSheet({
  clienteId,
  equipamento,
  onOpenChange,
  onAbrirNota,
}: {
  clienteId: string;
  equipamento: PosicaoClienteEquipamento | null;
  onOpenChange: (aberto: boolean) => void;
  onAbrirNota: (tipo: PosicaoClienteEquipamentoMovimento["tipo"], notaId: string) => void;
}) {
  const produtoId = equipamento?.produtoId ?? null;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["clientes", clienteId, "equipamentos", produtoId, "movimentos"],
    queryFn: () =>
      apiFetch<PosicaoClienteEquipamentoMovimento[]>(
        `/clientes/${clienteId}/equipamentos/${produtoId}/movimentos`,
      ),
    enabled: !!produtoId,
  });
  const movimentos = data ?? [];
  const nota = (m: PosicaoClienteEquipamentoMovimento) =>
    `${m.numero}${m.serie ? `/${m.serie}` : ""}`;

  return (
    <Sheet open={!!equipamento} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={720}>
        <SheetHeader className="pr-10">
          <SheetTitle className="break-words">{equipamento?.descricao ?? "Equipamento"}</SheetTitle>
          {equipamento && (
            <SheetDescription asChild>
              <div className="space-y-1">
                <p className="font-mono text-xs">
                  {[equipamento.codigoErp, equipamento.categoria].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs">
                  Enviada {qtd(equipamento.quantidadeEnviada)} · devolvida{" "}
                  {qtd(equipamento.quantidadeDevolvida)} · baixada {qtd(equipamento.quantidadeBaixada)} ·{" "}
                  <span className={cn("font-medium text-foreground", equipamento.saldo < 0 && "text-destructive")}>
                    saldo {qtd(equipamento.saldo)}
                  </span>
                </p>
              </div>
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-48 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Não foi possível carregar as notas.</p>}
          {data && movimentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma nota de remessa ou retorno encontrada.</p>
          )}
          {movimentos.length > 0 && (
            <>
              <div className="space-y-2 md:hidden">
                {movimentos.map((m) => (
                  <button
                    key={`${m.tipo}-${m.notaId}-${m.item ?? ""}`}
                    type="button"
                    onClick={() => onAbrirNota(m.tipo, m.notaId)}
                    className="w-full space-y-1 rounded-lg border px-3 py-2.5 text-left active:bg-muted/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm">
                        Nota {nota(m)}
                        {m.item != null && <span className="text-muted-foreground"> · item {m.item}</span>}
                      </span>
                      <TipoBadge tipo={m.tipo} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dataCivilBr(m.dtEmissao)} · qtd {qtd(m.quantidade)}
                      {m.cfop ? ` · CFOP ${m.cfop}` : ""}
                    </p>
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border max-md:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nota</TableHead>
                      <TableHead className="text-right">Item</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead>CFOP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentos.map((m) => (
                      <TableRow
                        key={`${m.tipo}-${m.notaId}-${m.item ?? ""}`}
                        className="cursor-pointer"
                        onClick={() => onAbrirNota(m.tipo, m.notaId)}
                      >
                        <TableCell className="font-mono text-xs">{nota(m)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.item ?? "—"}</TableCell>
                        <TableCell>{dataCivilBr(m.dtEmissao)}</TableCell>
                        <TableCell>
                          <TipoBadge tipo={m.tipo} />
                        </TableCell>
                        <TableCell className="text-right">{qtd(m.quantidade)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.cfop || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
