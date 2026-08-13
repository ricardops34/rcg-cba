"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  INDICADORES_EVOLUCAO,
  MAX_MESES_CONSULTA,
  MESES_LABEL,
  type ConsultaEvolucaoResultado,
  type IndicadorEvolucao,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { exportarConsultaExcel, exportarConsultaPdf } from "@/lib/consulta-export";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { VendedoresMultiSelect } from "@/components/crud/vendedores-multi-select";
import {
  PADRAO_EMPRESA,
  anosDisponiveis,
  erroDoPeriodo,
  mesesDoPeriodo,
  periodoPadrao,
} from "@/components/consultas/periodo-consulta";
import {
  GraficoEvolucao,
  TIPOS_GRAFICO_EVOLUCAO,
  type SerieEvolucao,
  type TipoGraficoEvolucao,
} from "@/components/consultas/grafico-evolucao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { FileSpreadsheet, FileText, SlidersHorizontal } from "lucide-react";

const ROTA = "/consultas/evolucao";
const ROTINA = "consulta-evolucao";

/**
 * Quantos vendedores ganham cor própria no gráfico. Do sétimo em diante o
 * resto vira uma única série "Outros", em cinza — gerar mais matizes seria
 * inventar cores que ninguém distingue (e a tabela abaixo continua trazendo
 * vendedor por vendedor).
 */
const MAX_SERIES = 6;

/** Item do resumo de parâmetros mostrado acima do gráfico. */
function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

interface Filtros {
  anoInicial: string;
  mesInicial: string;
  anoFinal: string;
  mesFinal: string;
  /** Vazio = todos os vendedores do escopo. */
  vendedorIds: string[];
  baseVendedor: string;
  /** Só desenho: não entra na query, o mesmo JSON serve as quatro formas. */
  tipoGrafico: TipoGraficoEvolucao;
}

/**
 * Consulta de evolução mensal: gráfico de linhas com uma série por vendedor,
 * quatro indicadores (vendas, positivados, novos e inativados) e a mesma
 * cortina de parâmetros das demais consultas do módulo. A tabela embaixo do
 * gráfico repete os números — é ela que atende quem não distingue as cores e
 * quem precisa do valor exato.
 */
export function ConsultaEvolucaoView() {
  const anos = useMemo(() => anosDisponiveis(), []);
  const filtrosIniciais: Filtros = useMemo(
    () => ({
      ...periodoPadrao(),
      vendedorIds: [],
      baseVendedor: PADRAO_EMPRESA,
      tipoGrafico: "linha" as TipoGraficoEvolucao,
    }),
    [],
  );
  // `filtros` é o que está valendo; `rascunho` é o que a cortina edita — sem a
  // separação, cada clique na cortina dispararia uma consulta no banco.
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [rascunho, setRascunho] = useState<Filtros>(filtrosIniciais);
  const [cortinaAberta, setCortinaAberta] = useState(false);
  const [indicador, setIndicador] = useState<IndicadorEvolucao>("vendas");

  const definicao =
    INDICADORES_EVOLUCAO.find((i) => i.valor === indicador) ?? INDICADORES_EVOLUCAO[0];

  const podeExportar = useAuthStore((s) => s.hasPermission)(ROTINA, "exportar");
  const usuario = useAuthStore((s) => s.user);
  const empresaNome = usuario?.empresas.find(
    (e) => e.empresaId === usuario.empresaAtivaId,
  )?.nomeFantasia;

  const vendedores = useVendedoresEscopo();

  const query = {
    anoInicial: filtros.anoInicial,
    mesInicial: filtros.mesInicial,
    anoFinal: filtros.anoFinal,
    mesFinal: filtros.mesFinal,
    vendedorIds:
      filtros.vendedorIds.length > 0 ? filtros.vendedorIds.join(",") : undefined,
    baseVendedor:
      filtros.baseVendedor === PADRAO_EMPRESA ? undefined : filtros.baseVendedor,
    indicador,
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", ROTA, query],
    queryFn: () => apiFetch<ConsultaEvolucaoResultado>(ROTA, { query }),
  });

  const abrirCortina = (aberta: boolean) => {
    // Reabrir depois de fechar sem aplicar precisa mostrar o que está valendo,
    // não o rascunho abandonado.
    if (aberta) setRascunho(filtros);
    setCortinaAberta(aberta);
  };

  const erroPeriodo = erroDoPeriodo(rascunho);
  const mesesDoRascunho = mesesDoPeriodo(rascunho);

  const aplicarFiltros = () => {
    if (erroPeriodo) return;
    setFiltros(rascunho);
    setCortinaAberta(false);
  };

  // Um nome cabe no resumo; vários viram contagem, senão a linha estoura.
  const nomeVendedorFiltrado =
    filtros.vendedorIds.length === 0
      ? null
      : filtros.vendedorIds.length === 1
        ? ((vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorIds[0])
            ?.nomeReduzido ?? null)
        : `${filtros.vendedorIds.length} vendedores`;
  const quantidadeFiltros = [
    filtros.vendedorIds.length > 0,
    filtros.baseVendedor !== PADRAO_EMPRESA,
    filtros.tipoGrafico !== "linha",
  ].filter(Boolean).length;

  /**
   * Séries do gráfico: as linhas já vêm ordenadas pelo total (maior primeiro),
   * então os seis primeiros vendedores levam as cores da paleta na ordem fixa
   * e o restante é somado mês a mês numa série "Outros".
   */
  const series = useMemo<SerieEvolucao[]>(() => {
    if (!data) return [];
    const principais = data.linhas.slice(0, MAX_SERIES).map((l, i) => ({
      id: l.id,
      nome: l.descricao,
      valores: l.valores,
      cor: `var(--viz-${i + 1})`,
    }));
    const resto = data.linhas.slice(MAX_SERIES);
    if (resto.length === 0) return principais;
    const somados = data.colunas.map((_, i) =>
      resto.reduce((acc, l) => acc + (l.valores[i] ?? 0), 0),
    );
    return [
      ...principais,
      {
        id: "outros",
        nome: `Outros (${resto.length} ${resto.length === 1 ? "vendedor" : "vendedores"})`,
        valores: somados,
        cor: "var(--muted-foreground)",
      },
    ];
  }, [data]);

  const valorCheio = (v: number) =>
    definicao.formato === "moeda"
      ? v.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  /** Zero vira "—": a tabela é quase toda numérica e o olho procura o que houve. */
  const celula = (v: number) => (v === 0 ? "—" : valorCheio(v));

  const exportar = (formato: "pdf" | "excel") => {
    if (!data) return;
    const params = {
      resultado: data,
      titulo: `Evolução Mensal — ${definicao.label}`,
      rotuloEntidade: "Vendedor",
      empresaNome,
      formato: definicao.formato,
      contextoExtra: [`Indicador: ${definicao.label}`],
    };
    try {
      if (formato === "pdf") exportarConsultaPdf(params);
      else exportarConsultaExcel(params);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Evolução Mensal</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirCortina(true)}>
            <SlidersHorizontal className="size-4" />
            Parâmetros
            {quantidadeFiltros > 0 && (
              <Badge variant="secondary" className="ml-1">
                {quantidadeFiltros}
              </Badge>
            )}
          </Button>
          {podeExportar && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.linhas.length === 0}
                onClick={() => exportar("pdf")}
              >
                <FileText className="size-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.linhas.length === 0}
                onClick={() => exportar("excel")}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={indicador} onValueChange={(v) => setIndicador(v as IndicadorEvolucao)}>
        <TabsList>
          {INDICADORES_EVOLUCAO.map((i) => (
            <TabsTrigger key={i.valor} value={i.valor}>
              {i.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Resumo do recorte: com os filtros na cortina, a tela precisa dizer
          sozinha de que período/vendedor é o número exibido. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedorFiltrado ?? "Todos"} />
          <Resumo
            label="Base"
            valor={
              indicador === "inativados"
                ? "Vendedor do cliente (fixo)"
                : data
                  ? data.baseVendedor === "cliente"
                    ? "Vendedor do cliente"
                    : "Vendedor da nota"
                  : "—"
            }
          />
          <Resumo
            label="Total do período"
            valor={data ? valorCheio(data.total) : "—"}
          />
        </CardContent>
      </Card>

      <Sheet open={cortinaAberta} onOpenChange={abrirCortina}>
        <ResizableSheetContent defaultWidth={420}>
          <SheetHeader>
            <SheetTitle>Parâmetros da consulta</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Período inicial</p>
              <div className="flex gap-2">
                <Select
                  value={rascunho.mesInicial}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, mesInicial: v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES_LABEL.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rascunho.anoInicial}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, anoInicial: v }))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Período final</p>
              <div className="flex gap-2">
                <Select
                  value={rascunho.mesFinal}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, mesFinal: v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES_LABEL.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rascunho.anoFinal}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, anoFinal: v }))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {erroPeriodo ? (
                <p className="text-xs text-destructive">{erroPeriodo}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mesesDoRascunho} {mesesDoRascunho === 1 ? "mês" : "meses"} no
                  período (máximo {MAX_MESES_CONSULTA}).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Vendedor</p>
              <VendedoresMultiSelect
                value={rascunho.vendedorIds}
                onChange={(ids) => setRascunho((r) => ({ ...r, vendedorIds: ids }))}
              />
              {rascunho.vendedorIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Cada vendedor selecionado vira uma série no gráfico (da sétima em
                  diante, agrupadas em “Outros”).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Tipo de gráfico</p>
              <Select
                value={rascunho.tipoGrafico}
                onValueChange={(v) =>
                  setRascunho((r) => ({ ...r, tipoGrafico: v as TipoGraficoEvolucao }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_GRAFICO_EVOLUCAO.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {TIPOS_GRAFICO_EVOLUCAO.find((t) => t.valor === rascunho.tipoGrafico)
                  ?.descricao}{" "}
                Os quatro formatos leem os mesmos números — muda a pergunta que o
                desenho responde, não o dado.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Vendedor considerado</p>
              <Select
                value={rascunho.baseVendedor}
                onValueChange={(v) => setRascunho((r) => ({ ...r, baseVendedor: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PADRAO_EMPRESA}>Padrão da empresa</SelectItem>
                  <SelectItem value="nota">Vendedor da nota</SelectItem>
                  <SelectItem value="cliente">Vendedor do cadastro do cliente</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quem leva o crédito: quem emitiu a nota, ou o titular da carteira do
                cliente. O padrão vem do parâmetro CONSULTA_VENDAS_BASE_VENDEDOR
                (Administração &gt; Parâmetros). Em “Clientes inativados” a escolha não
                se aplica — não há nota envolvida, e o crédito é sempre do vendedor do
                cadastro.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={aplicarFiltros} disabled={!!erroPeriodo}>
                Aplicar
              </Button>
              <Button variant="ghost" onClick={() => setRascunho(filtrosIniciais)}>
                Limpar
              </Button>
            </div>
          </div>
        </ResizableSheetContent>
      </Sheet>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar a consulta.
        </p>
      ) : !data || data.linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nada encontrado no período com os filtros escolhidos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">
                  {definicao.label} por mês
                  {definicao.formato === "moeda" ? " (R$)" : " (clientes)"}
                </h2>
                <p className="text-xs text-muted-foreground">{definicao.descricao}</p>
              </div>
              <GraficoEvolucao
                meses={data.colunas.map((c) => c.label)}
                series={series}
                formato={definicao.formato}
                rotuloValor={definicao.label}
                tipo={filtros.tipoGrafico}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {data.linhas.length.toLocaleString("pt-BR")}{" "}
                {data.linhas.length === 1 ? "vendedor" : "vendedores"} ·{" "}
                {definicao.totalSomaMeses
                  ? "o total do período é a soma dos meses"
                  : "cada cliente conta uma única vez no período"}
              </p>
              <div className="max-h-[60vh] overflow-x-hidden overflow-y-auto rounded-lg border">
                <Table className="w-full table-fixed">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-[18%] px-2">Vendedor</TableHead>
                      {data.colunas.map((c) => (
                        <TableHead
                          key={c.label}
                          className="px-1.5 text-right text-xs whitespace-nowrap"
                        >
                          {c.label}
                        </TableHead>
                      ))}
                      <TableHead className="px-1.5 text-right text-xs">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.linhas.map((l, indice) => (
                      <TableRow key={l.id}>
                        {/* whitespace-normal: TableCell é nowrap por padrão e
                            white-space herda, então sem isto o break-words
                            abaixo não quebra nome nenhum. */}
                        <TableCell className="px-2 align-top whitespace-normal">
                          <div className="flex items-start gap-1.5">
                            {/* O mesmo marcador de cor do gráfico, para ligar
                                linha e série sem depender só da cor. */}
                            <span
                              className="mt-1.5 h-0.5 w-3 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  indice < MAX_SERIES
                                    ? `var(--viz-${indice + 1})`
                                    : "var(--muted-foreground)",
                              }}
                            />
                            <div>
                              <p className="text-xs break-words hyphens-auto">
                                {l.descricao}
                              </p>
                              {l.codigo && (
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {l.codigo}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {l.valores.map((v, i) => (
                          <TableCell
                            key={i}
                            className="px-1.5 text-right align-top text-[11px] tabular-nums"
                          >
                            {celula(v)}
                          </TableCell>
                        ))}
                        <TableCell className="px-1.5 text-right align-top text-[11px] font-medium tabular-nums">
                          {valorCheio(l.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot className="sticky bottom-0 z-10 bg-card">
                    <TableRow className="font-medium">
                      <TableCell className="px-2 text-xs">Total geral</TableCell>
                      {data.totais.map((v, i) => (
                        <TableCell
                          key={i}
                          className="px-1.5 text-right text-[11px] tabular-nums"
                        >
                          {celula(v)}
                        </TableCell>
                      ))}
                      <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                        {valorCheio(data.total)}
                      </TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
