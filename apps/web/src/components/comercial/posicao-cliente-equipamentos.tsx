"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Undo2, Wrench } from "lucide-react";
import type { PosicaoClienteEquipamento } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SortOrder = "asc" | "desc";
type SituacaoFiltro = "todos" | "comSaldo" | "semConsumo" | "baixados" | "devolvidos";
type Coluna =
  | "codigoErp"
  | "descricao"
  | "categoria"
  | "quantidadeEnviada"
  | "quantidadeDevolvida"
  | "quantidadeBaixada"
  | "saldo"
  | "ultimaRemessa"
  | "ultimaCompraAplicavel";

const SEM_CATEGORIA = "__sem__";

const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataHora = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function comparar(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR");
  return (a as number) - (b as number);
}

/**
 * Aba "Equipamentos": o que foi enviado em comodato ao cliente, por produto,
 * quanto voltou pelas notas de retorno e quanto foi baixado. Saldo = enviada −
 * devolvida − baixada.
 *
 * Baixar é para o equipamento que não volta por nota (perdido, recolhido sem
 * nota): o saldo deixa de contar e sai do aviso. Fica registrado quem baixou e
 * entra no histórico de atendimento; "Desfazer" corrige a baixa errada.
 */
export function TabelaEquipamentos({
  clienteId,
  equipamentos,
  onSelecionarProduto,
}: {
  clienteId: string;
  equipamentos: PosicaoClienteEquipamento[];
  onSelecionarProduto: (produtoId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [situacao, setSituacao] = useState<SituacaoFiltro>("todos");
  const [sortBy, setSortBy] = useState<Coluna>("saldo");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [baixando, setBaixando] = useState<PosicaoClienteEquipamento | null>(null);
  const [motivo, setMotivo] = useState("");

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["clientes", clienteId] });
    void queryClient.invalidateQueries({ queryKey: ["atividades", "cliente", clienteId] });
  };

  const baixar = useMutation({
    mutationFn: (input: { produtoId: string; motivo: string | null }) =>
      apiFetch<{ quantidade: number }>(`/clientes/${clienteId}/comodato-baixas`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (r) => {
      toast.success(`Baixa registrada (${qtd(r.quantidade)}). Entrou no histórico de atendimento.`);
      setBaixando(null);
      setMotivo("");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível baixar"),
  });

  const desfazer = useMutation({
    mutationFn: (baixaId: string) =>
      apiFetch(`/clientes/${clienteId}/comodato-baixas/${baixaId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Baixa desfeita: o saldo volta a contar.");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível desfazer"),
  });

  const categorias = useMemo(
    () =>
      [...new Set(equipamentos.map((e) => e.categoria ?? SEM_CATEGORIA))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [equipamentos],
  );

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = equipamentos.filter((e) => {
      if (situacao === "comSaldo" && e.saldo <= 0) return false;
      if (situacao === "semConsumo" && !e.semConsumo) return false;
      if (situacao === "baixados" && e.quantidadeBaixada <= 0) return false;
      if (situacao === "devolvidos" && e.saldo > 0) return false;
      if (categoria !== "todas" && (e.categoria ?? SEM_CATEGORIA) !== categoria) return false;
      return (
        !termo ||
        (e.codigoErp ?? "").toLowerCase().includes(termo) ||
        e.descricao.toLowerCase().includes(termo)
      );
    });
    const ordenadas = filtradas.sort((a, b) => comparar(a[sortBy], b[sortBy]));
    return sortOrder === "desc" ? ordenadas.reverse() : ordenadas;
  }, [equipamentos, busca, categoria, situacao, sortBy, sortOrder]);

  const totais = useMemo(
    () =>
      linhas.reduce(
        (acc, e) => ({
          enviada: acc.enviada + e.quantidadeEnviada,
          devolvida: acc.devolvida + e.quantidadeDevolvida,
          baixada: acc.baixada + e.quantidadeBaixada,
          saldo: acc.saldo + e.saldo,
        }),
        { enviada: 0, devolvida: 0, baixada: 0, saldo: 0 },
      ),
    [linhas],
  );

  const ordenarPor = (coluna: Coluna) => {
    if (sortBy !== coluna) {
      setSortBy(coluna);
      setSortOrder("asc");
    } else {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    }
  };

  const cabecalho = (label: string, coluna: Coluna, className?: string) => (
    <SortableTableHead
      label={label}
      className={className}
      active={sortBy === coluna}
      order={sortOrder}
      onClick={() => ordenarPor(coluna)}
    />
  );

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as SituacaoFiltro)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="comSaldo">Com saldo no cliente</SelectItem>
              <SelectItem value="semConsumo">Sem consumo (30 dias)</SelectItem>
              <SelectItem value="baixados">Baixados</SelectItem>
              <SelectItem value="devolvidos">Devolvidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === SEM_CATEGORIA ? "Sem categoria" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {equipamentos.length === 0
              ? "Nenhum equipamento enviado em comodato a este cliente."
              : "Nenhum equipamento encontrado com esses filtros."}
          </p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {cabecalho("Código", "codigoErp")}
                  {cabecalho("Descrição", "descricao")}
                  {cabecalho("Categoria", "categoria")}
                  {cabecalho("Qtd. enviada", "quantidadeEnviada", "text-right")}
                  {cabecalho("Qtd. devolvida", "quantidadeDevolvida", "text-right")}
                  {cabecalho("Qtd. baixada", "quantidadeBaixada", "text-right")}
                  {cabecalho("Saldo", "saldo", "text-right")}
                  {cabecalho("Última remessa", "ultimaRemessa")}
                  {cabecalho("Últ. compra aplicável", "ultimaCompraAplicavel")}
                  <TableCell className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((e) => (
                  <TableRow
                    key={e.produtoId ?? e.descricao}
                    className={e.produtoId ? "cursor-pointer" : undefined}
                    onClick={() => e.produtoId && onSelecionarProduto(e.produtoId)}
                  >
                    <TableCell className="font-mono text-xs">{e.codigoErp ?? "—"}</TableCell>
                    <TableCell>
                      {e.descricao}
                      {e.semConsumo && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        >
                          <Wrench className="size-3" /> Sem consumo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{e.categoria ?? "—"}</TableCell>
                    <TableCell className="text-right">{qtd(e.quantidadeEnviada)}</TableCell>
                    <TableCell className="text-right">{qtd(e.quantidadeDevolvida)}</TableCell>
                    <TableCell className="text-right">
                      {e.quantidadeBaixada > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="underline decoration-dotted">
                              {qtd(e.quantidadeBaixada)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {e.baixas.map((b) => (
                              <p key={b.id}>
                                {qtd(b.quantidade)} por {b.autor ?? "—"} em {dataHora(b.createdAt)}
                                {b.motivo ? ` — ${b.motivo}` : ""}
                              </p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-medium", e.saldo < 0 && "text-destructive")}
                      title={
                        e.saldo < 0
                          ? "Voltou mais do que foi enviado pelas notas: envio anterior à base ou produto trocado no retorno"
                          : undefined
                      }
                    >
                      {qtd(e.saldo)}
                    </TableCell>
                    <TableCell>{dataCivilBr(e.ultimaRemessa)}</TableCell>
                    <TableCell className="text-xs">
                      {e.totalAplicaveis === 0 ? (
                        <span className="text-muted-foreground" title="Sem produtos aplicáveis cadastrados">
                          —
                        </span>
                      ) : (
                        dataCivilBr(e.ultimaCompraAplicavel, "Nunca")
                      )}
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {e.baixas.length > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={desfazer.isPending}
                          onClick={() => {
                            const b = e.baixas[0];
                            if (
                              window.confirm(
                                `Desfazer a baixa de ${qtd(b.quantidade)} feita por ${b.autor ?? "—"} em ${dataHora(b.createdAt)}?`,
                              )
                            )
                              desfazer.mutate(b.id);
                          }}
                        >
                          <Undo2 className="size-4" />
                          Desfazer
                        </Button>
                      ) : e.saldo > 0 && e.produtoId ? (
                        <Button size="sm" variant="outline" onClick={() => setBaixando(e)}>
                          Baixar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableCell colSpan={3}>Total ({linhas.length} produtos)</TableCell>
                  <TableCell className="text-right">{qtd(totais.enviada)}</TableCell>
                  <TableCell className="text-right">{qtd(totais.devolvida)}</TableCell>
                  <TableCell className="text-right">{qtd(totais.baixada)}</TableCell>
                  <TableCell className="text-right">{qtd(totais.saldo)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!baixando} onOpenChange={(o) => !o && setBaixando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baixar comodato</DialogTitle>
            <DialogDescription>
              {baixando &&
                `${qtd(baixando.saldo)} × ${baixando.descricao} deixam de contar no saldo e no aviso de consumo. `}
              Fica registrado quem baixou e entra no histórico de atendimento do cliente. Dá para
              desfazer depois.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Motivo (ex.: equipamento quebrado, recolhido sem nota)"
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            maxLength={300}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={baixar.isPending}
              onClick={() =>
                baixando?.produtoId &&
                baixar.mutate({ produtoId: baixando.produtoId, motivo: motivo.trim() || null })
              }
            >
              Baixar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
