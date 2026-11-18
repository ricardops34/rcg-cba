"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { CornerDownRight } from "lucide-react";
import type {
  PosicaoClienteEquipamento,
  PosicaoClienteEquipamentoMovimentos,
  PosicaoClienteEquipamentoRetorno,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type TipoNotaComodato = "remessa" | "retorno";

const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const nota = (numero: string, serie: string | null) => `${numero}${serie ? `/${serie}` : ""}`;

function TipoBadge({ tipo }: { tipo: TipoNotaComodato }) {
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

/** Retorno que diz devolver uma remessa que não está na plataforma. */
function origemFora(r: PosicaoClienteEquipamentoRetorno) {
  return r.notaOrigem
    ? `Devolve a remessa ${nota(r.notaOrigem, r.serieOrigem)}${r.itemOrigem != null ? ` item ${r.itemOrigem}` : ""}, que não está na plataforma`
    : null;
}

/**
 * Cortina de detalhe do equipamento na aba Equipamentos (pedido de
 * 17/11/2026): o equipamento no topo e, embaixo, cada remessa (nota de saída)
 * com os retornos (notas de entrada) que a devolvem e o saldo dela. O vínculo
 * vem da nota de origem do item de entrada; retorno sem ele (importado antes)
 * fica no fim, em "sem remessa vinculada", para o total bater com a linha.
 * Clique na nota abre a nota completa em outra cortina; lá, o item abre o
 * produto.
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
  onAbrirNota: (tipo: TipoNotaComodato, notaId: string) => void;
}) {
  const produtoId = equipamento?.produtoId ?? null;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["clientes", clienteId, "equipamentos", produtoId, "movimentos"],
    queryFn: () =>
      apiFetch<PosicaoClienteEquipamentoMovimentos>(
        `/clientes/${clienteId}/equipamentos/${produtoId}/movimentos`,
      ),
    enabled: !!produtoId,
  });
  const remessas = data?.remessas ?? [];
  const semVinculo = data?.retornosSemVinculo ?? [];
  const enviada = remessas.reduce((s, r) => s + r.quantidade, 0);
  const retornada =
    remessas.reduce((s, r) => s + r.quantidadeRetornada, 0) +
    semVinculo.reduce((s, r) => s + r.quantidade, 0);
  const vazio = !!data && remessas.length === 0 && semVinculo.length === 0;

  const linhaRetorno = (r: PosicaoClienteEquipamentoRetorno, recuo: boolean) => (
    <TableRow
      key={r.itemId}
      className="cursor-pointer text-muted-foreground"
      onClick={() => onAbrirNota("retorno", r.notaId)}
      title={origemFora(r) ?? undefined}
    >
      <TableCell className={cn(recuo && "pl-6")}>
        <span className="inline-flex items-center gap-1">
          {recuo && <CornerDownRight className="size-3.5" />}
          <TipoBadge tipo="retorno" />
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">{nota(r.numero, r.serie)}</TableCell>
      <TableCell className="text-right">{r.item ?? "—"}</TableCell>
      <TableCell>{dataCivilBr(r.dtEmissao)}</TableCell>
      <TableCell />
      <TableCell className="text-right">{qtd(r.quantidade)}</TableCell>
      <TableCell />
    </TableRow>
  );

  return (
    <Sheet open={!!equipamento} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={760}>
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
          {vazio && (
            <p className="text-sm text-muted-foreground">Nenhuma nota de remessa ou retorno encontrada.</p>
          )}
          {data && !vazio && (
            <>
              {/* Celular: um cartão por remessa, com os retornos dentro. */}
              <div className="space-y-2 md:hidden">
                {remessas.map((r) => (
                  <div key={r.itemId} className="space-y-1.5 rounded-lg border px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onAbrirNota("remessa", r.notaId)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="font-mono text-sm">
                        Nota {nota(r.numero, r.serie)}
                        {r.item != null && <span className="text-muted-foreground"> · item {r.item}</span>}
                      </span>
                      <TipoBadge tipo="remessa" />
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {dataCivilBr(r.dtEmissao)} · enviada {qtd(r.quantidade)} · retornada{" "}
                      {qtd(r.quantidadeRetornada)} ·{" "}
                      <span className={cn("font-medium text-foreground", r.saldo < 0 && "text-destructive")}>
                        saldo {qtd(r.saldo)}
                      </span>
                    </p>
                    {r.retornos.map((x) => (
                      <button
                        key={x.itemId}
                        type="button"
                        onClick={() => onAbrirNota("retorno", x.notaId)}
                        className="flex w-full items-center gap-1.5 pl-2 text-left text-xs text-muted-foreground"
                      >
                        <CornerDownRight className="size-3.5 shrink-0" />
                        Retorno {nota(x.numero, x.serie)}
                        {x.item != null && ` item ${x.item}`} · {dataCivilBr(x.dtEmissao)} · {qtd(x.quantidade)}
                      </button>
                    ))}
                  </div>
                ))}
                {semVinculo.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-dashed px-3 py-2.5">
                    <p className="text-xs font-medium">Retornos sem remessa vinculada</p>
                    {semVinculo.map((x) => (
                      <button
                        key={x.itemId}
                        type="button"
                        onClick={() => onAbrirNota("retorno", x.notaId)}
                        className="block w-full text-left text-xs text-muted-foreground"
                      >
                        Retorno {nota(x.numero, x.serie)}
                        {x.item != null && ` item ${x.item}`} · {dataCivilBr(x.dtEmissao)} · {qtd(x.quantidade)}
                        {origemFora(x) && <span className="block">{origemFora(x)}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <p className="px-1 text-xs font-medium">
                  Total: enviada {qtd(enviada)} · retornada {qtd(retornada)} · saldo {qtd(enviada - retornada)}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border max-md:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nota</TableHead>
                      <TableHead className="text-right">Item</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead className="text-right">Enviada</TableHead>
                      <TableHead className="text-right">Retornada</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remessas.map((r) => (
                      <Fragment key={r.itemId}>
                        <TableRow className="cursor-pointer" onClick={() => onAbrirNota("remessa", r.notaId)}>
                          <TableCell>
                            <TipoBadge tipo="remessa" />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{nota(r.numero, r.serie)}</TableCell>
                          <TableCell className="text-right">{r.item ?? "—"}</TableCell>
                          <TableCell>{dataCivilBr(r.dtEmissao)}</TableCell>
                          <TableCell className="text-right">{qtd(r.quantidade)}</TableCell>
                          <TableCell className="text-right">{qtd(r.quantidadeRetornada)}</TableCell>
                          <TableCell className={cn("text-right font-medium", r.saldo < 0 && "text-destructive")}>
                            {qtd(r.saldo)}
                          </TableCell>
                        </TableRow>
                        {r.retornos.map((x) => linhaRetorno(x, true))}
                      </Fragment>
                    ))}
                    {semVinculo.length > 0 && (
                      <>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7} className="text-xs font-medium whitespace-normal">
                            Retornos sem remessa vinculada ({semVinculo.length})
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              — chegaram sem a nota de origem, ou a remessa não está na plataforma
                            </span>
                          </TableCell>
                        </TableRow>
                        {semVinculo.map((x) => linhaRetorno(x, false))}
                      </>
                    )}
                    <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right">{qtd(enviada)}</TableCell>
                      <TableCell className="text-right">{qtd(retornada)}</TableCell>
                      <TableCell className={cn("text-right", enviada - retornada < 0 && "text-destructive")}>
                        {qtd(enviada - retornada)}
                      </TableCell>
                    </TableRow>
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
