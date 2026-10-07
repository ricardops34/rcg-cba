"use client";

import { useMemo, useState } from "react";
import type { PosicaoClienteEquipamento } from "@plataforma/contracts";
import { dataCivilBr } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";

type SortOrder = "asc" | "desc";
type SituacaoFiltro = "todos" | "comSaldo" | "devolvidos";
type Coluna =
  | "codigoErp"
  | "descricao"
  | "categoria"
  | "quantidadeEnviada"
  | "quantidadeDevolvida"
  | "saldo"
  | "ultimaRemessa";

const SEM_CATEGORIA = "__sem__";

const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function comparar(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR");
  return (a as number) - (b as number);
}

/**
 * Aba "Equipamentos": o que foi enviado em comodato ao cliente, por produto,
 * e quanto voltou pelas notas de retorno. O saldo é a conta das notas
 * (enviada − devolvida); baixa feita no ERP sem nota não aparece aqui.
 */
export function TabelaEquipamentos({
  equipamentos,
  onSelecionarProduto,
}: {
  equipamentos: PosicaoClienteEquipamento[];
  onSelecionarProduto: (produtoId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [situacao, setSituacao] = useState<SituacaoFiltro>("todos");
  const [sortBy, setSortBy] = useState<Coluna>("saldo");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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
          saldo: acc.saldo + e.saldo,
        }),
        { enviada: 0, devolvida: 0, saldo: 0 },
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
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="comSaldo">Com saldo no cliente</SelectItem>
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
                  {cabecalho("Saldo", "saldo", "text-right")}
                  {cabecalho("Última remessa", "ultimaRemessa")}
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
                    <TableCell>{e.descricao}</TableCell>
                    <TableCell className="text-xs">{e.categoria ?? "—"}</TableCell>
                    <TableCell className="text-right">{qtd(e.quantidadeEnviada)}</TableCell>
                    <TableCell className="text-right">{qtd(e.quantidadeDevolvida)}</TableCell>
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
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableCell colSpan={3}>Total ({linhas.length} produtos)</TableCell>
                  <TableCell className="text-right">{qtd(totais.enviada)}</TableCell>
                  <TableCell className="text-right">{qtd(totais.devolvida)}</TableCell>
                  <TableCell className="text-right">{qtd(totais.saldo)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
