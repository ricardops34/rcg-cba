"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MAX_MESES_CONSULTA,
  MESES_LABEL,
  emMeses,
  totalDeMeses,
  type ConsultaVendasLinha,
  type ConsultaVendasResultado,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import {
  exportarConsultaExcel,
  exportarConsultaPdf,
} from "@/lib/consulta-export";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { FileSpreadsheet, FileText, Search, SlidersHorizontal } from "lucide-react";

/** Item do resumo de parâmetros mostrado acima da tabela. */
function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

/** Valor "todos" dos selects — Radix não aceita SelectItem com value="". */
export const TODOS = "todos";

/** Colunas ordenáveis: a identificação (nome/descrição) e o total do período. */
type OrdenarPor = "descricao" | "total";

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Zero em coluna de mês vira "—": a tabela é quase toda numérica e o olho
 *  precisa achar onde houve venda. */
const celula = (v: number) => (v === 0 ? "—" : moeda(v));

/** Últimos 6 anos + o atual, do mais recente para o mais antigo. */
export function anosDisponiveis(): number[] {
  const atual = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => atual - i);
}

/** Select adicional específico de uma consulta (hoje só Categoria). */
export interface FiltroExtra {
  /** Nome do parâmetro na API, ex.: "categoriaId". */
  chave: string;
  label: string;
  /** Rótulo da opção "sem filtro", ex.: "Todas". */
  rotuloTodos: string;
  opcoes: { id: string; descricao: string }[];
}

/**
 * "padrao" = respeita o parâmetro CONSULTA_VENDAS_BASE_VENDEDOR da empresa;
 * as outras duas sobrescrevem só nesta consulta.
 */
const PADRAO_EMPRESA = "padrao";

/** Estado dos filtros da consulta — o que a cortina edita e o botão aplica. */
interface Filtros {
  anoInicial: string;
  mesInicial: string;
  anoFinal: string;
  mesFinal: string;
  vendedorId: string;
  baseVendedor: string;
  extra: string;
}

/** Período padrão: os 12 meses que terminam no mês corrente. */
function periodoPadrao(): Pick<
  Filtros,
  "anoInicial" | "mesInicial" | "anoFinal" | "mesFinal"
> {
  const hoje = new Date();
  const fim = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  const inicioEmMeses = emMeses(fim.ano, fim.mes) - (MAX_MESES_CONSULTA - 1);
  // emMeses = ano*12 + mes, com mes de 1 a 12: desfazer a conta exige tratar
  // o mês 12 como resto 0 do ano anterior.
  const ano = Math.floor((inicioEmMeses - 1) / 12);
  const mes = inicioEmMeses - ano * 12;
  return {
    anoInicial: String(ano),
    mesInicial: String(mes),
    anoFinal: String(fim.ano),
    mesFinal: String(fim.mes),
  };
}

/** Mensagem de erro do período, ou null se estiver válido. */
function erroDoPeriodo(f: Filtros): string | null {
  const p = {
    anoInicial: Number(f.anoInicial),
    mesInicial: Number(f.mesInicial),
    anoFinal: Number(f.anoFinal),
    mesFinal: Number(f.mesFinal),
  };
  const meses = totalDeMeses(p);
  if (meses < 1) return "O fim do período não pode ser anterior ao início.";
  if (meses > MAX_MESES_CONSULTA)
    return `O período não pode passar de ${MAX_MESES_CONSULTA} meses (escolhido: ${meses}).`;
  return null;
}

/**
 * Tela das Consultas de venda: filtros numa cortina lateral, tabela pivô (uma
 * linha por cliente/produto/vendedor, 12 colunas de mês + total) e exportação.
 *
 * As consultas do módulo compartilham este componente — muda só a rota da
 * API, o rótulo da primeira coluna e o filtro extra de categoria.
 */
export function ConsultaVendasView({
  titulo,
  rotuloEntidade,
  rota,
  rotina,
  filtroExtra,
}: {
  titulo: string;
  rotuloEntidade: string;
  /** Caminho na API, ex.: "/consultas/vendas-cliente". */
  rota: string;
  /** Código da rotina, para a permissão de exportar. */
  rotina: string;
  filtroExtra?: FiltroExtra;
}) {
  const anos = useMemo(() => anosDisponiveis(), []);
  const filtrosIniciais: Filtros = useMemo(
    () => ({
      ...periodoPadrao(),
      vendedorId: TODOS,
      baseVendedor: PADRAO_EMPRESA,
      extra: TODOS,
    }),
    [],
  );
  // `filtros` é o que está valendo na consulta; `rascunho` é o que a cortina
  // está editando. Sem essa separação, cada clique dentro da cortina dispara
  // uma consulta de ano inteiro no banco.
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [rascunho, setRascunho] = useState<Filtros>(filtrosIniciais);
  const [cortinaAberta, setCortinaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  // Ordenação client-side: o ano inteiro já está na mão, e o relatório tem
  // poucas centenas de linhas. Começa pelo maior total, como o back-end
  // devolve.
  const [sortBy, setSortBy] = useState<OrdenarPor>("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const podeExportar = useAuthStore((s) => s.hasPermission)(rotina, "exportar");
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
    vendedorId: filtros.vendedorId === TODOS ? undefined : filtros.vendedorId,
    baseVendedor:
      filtros.baseVendedor === PADRAO_EMPRESA ? undefined : filtros.baseVendedor,
    ...(filtroExtra && filtros.extra !== TODOS
      ? { [filtroExtra.chave]: filtros.extra }
      : {}),
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", rota, query],
    queryFn: () => apiFetch<ConsultaVendasResultado>(rota, { query }),
  });

  const abrirCortina = (aberta: boolean) => {
    // Reabrir a cortina depois de fechar sem aplicar precisa mostrar o que
    // está valendo, não o rascunho abandonado.
    if (aberta) setRascunho(filtros);
    setCortinaAberta(aberta);
  };

  // A mesma regra do back-end (validarPeriodo) roda aqui para o usuário ver o
  // problema antes de disparar a consulta.
  const erroPeriodo = erroDoPeriodo(rascunho);
  const mesesDoRascunho = totalDeMeses({
    anoInicial: Number(rascunho.anoInicial),
    mesInicial: Number(rascunho.mesInicial),
    anoFinal: Number(rascunho.anoFinal),
    mesFinal: Number(rascunho.mesFinal),
  });

  const aplicarFiltros = () => {
    if (erroPeriodo) return;
    setFiltros(rascunho);
    setCortinaAberta(false);
  };

  const nomeVendedorFiltrado =
    filtros.vendedorId === TODOS
      ? null
      : (vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorId)
          ?.nomeReduzido ?? null;
  const nomeExtraFiltrado =
    filtroExtra && filtros.extra !== TODOS
      ? filtroExtra.opcoes.find((o) => o.id === filtros.extra)?.descricao ?? null
      : null;
  const quantidadeFiltros = [
    filtros.vendedorId !== TODOS,
    filtros.baseVendedor !== PADRAO_EMPRESA,
    filtros.extra !== TODOS,
  ].filter(Boolean).length;

  const ordenar = useCallback(
    (linhas: ConsultaVendasLinha[]) => {
      const ordenadas = [...linhas].sort((a, b) =>
        sortBy === "descricao"
          ? a.descricao.localeCompare(b.descricao, "pt-BR")
          : a.total - b.total,
      );
      return sortOrder === "desc" ? ordenadas.reverse() : ordenadas;
    },
    [sortBy, sortOrder],
  );

  // A busca é local: o servidor já devolveu o ano inteiro, e filtrar aqui
  // evita uma ida ao banco a cada tecla. Os totais do rodapé continuam sendo
  // os do resultado completo — o rodapé é do relatório, não do filtro.
  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!data) return [];
    const filtradas = termo
      ? data.linhas.filter(
          (l) =>
            l.descricao.toLowerCase().includes(termo) ||
            (l.codigo ?? "").toLowerCase().includes(termo),
        )
      : data.linhas;
    return ordenar(filtradas);
  }, [data, busca, ordenar]);

  const alternarOrdem = (coluna: OrdenarPor) => {
    if (sortBy === coluna) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(coluna);
      // Nome começa de A a Z; valor começa do maior — é o que se espera de
      // cada um.
      setSortOrder(coluna === "descricao" ? "asc" : "desc");
    }
  };

  const exportar = (formato: "pdf" | "excel") => {
    if (!data) return;
    // O arquivo sai na ordem escolhida na tela, mas com o relatório inteiro:
    // a busca é uma lente de consulta, não um recorte do relatório (o rodapé
    // de totais segue a mesma regra).
    const params = {
      resultado: { ...data, linhas: ordenar(data.linhas) },
      titulo,
      rotuloEntidade,
      empresaNome,
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
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
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

      {/* Resumo do que está valendo: com os filtros na cortina, a tela
          precisa dizer sozinha de que recorte é o número exibido. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedorFiltrado ?? "Todos"} />
          {filtroExtra && (
            <Resumo
              label={filtroExtra.label}
              valor={nomeExtraFiltrado ?? filtroExtra.rotuloTodos}
            />
          )}
          <Resumo
            label="Base"
            valor={
              data
                ? data.baseVendedor === "cliente"
                  ? "Vendedor do cliente"
                  : "Vendedor da nota"
                : "—"
            }
          />
          <div className="relative ml-auto w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Buscar ${rotuloEntidade.toLowerCase()} na lista...`}
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
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
              <Select
                value={rascunho.vendedorId}
                onValueChange={(v) => setRascunho((r) => ({ ...r, vendedorId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {(vendedores.data?.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vendedorFiltroLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtroExtra && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{filtroExtra.label}</p>
                <Select
                  value={rascunho.extra}
                  onValueChange={(v) => setRascunho((r) => ({ ...r, extra: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={filtroExtra.rotuloTodos} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>{filtroExtra.rotuloTodos}</SelectItem>
                    {filtroExtra.opcoes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                Quem leva o crédito da venda: quem emitiu a nota, ou o titular da
                carteira do cliente. O padrão vem do parâmetro
                CONSULTA_VENDAS_BASE_VENDEDOR (Administração &gt; Parâmetros) e
                pode ser trocado só nesta consulta.
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
              Nenhuma venda no período com os filtros escolhidos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {linhasVisiveis.length.toLocaleString("pt-BR")} de{" "}
              {data.linhas.length.toLocaleString("pt-BR")} linhas ·{" "}
              {data.baseVendedor === "cliente"
                ? "vendedor titular do cliente"
                : "vendedor da nota"}
            </p>
            {/* Sem rolagem horizontal: a tabela é `table-fixed`, a coluna de
                identificação leva 18% e quebra em várias linhas, e as colunas
                de valor dividem o resto — quanto menor o período, mais larga
                cada uma. Em tela estreita o texto quebra em mais linhas, e
                nunca aparece barra horizontal. */}
            <div className="max-h-[70vh] overflow-x-hidden overflow-y-auto rounded-lg border">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableTableHead
                      label={rotuloEntidade}
                      className="w-[18%] px-2"
                      active={sortBy === "descricao"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("descricao")}
                    />
                    {data.colunas.map((c) => (
                      <TableHead
                        key={c.label}
                        className="px-1.5 text-right text-xs whitespace-nowrap"
                      >
                        {c.label}
                      </TableHead>
                    ))}
                    <SortableTableHead
                      label="Total"
                      // O botão do cabeçalho é flex block-level: alinhar o
                      // rótulo à direita exige largura cheia + justify-end.
                      className="px-1.5 [&>button]:w-full [&>button]:justify-end"
                      active={sortBy === "total"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("total")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasVisiveis.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="px-2 align-top">
                        <p className="text-xs break-words hyphens-auto">
                          {l.descricao}
                        </p>
                        {l.codigo && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {l.codigo}
                          </p>
                        )}
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
                        {moeda(l.total)}
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
                      {moeda(data.total)}
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
