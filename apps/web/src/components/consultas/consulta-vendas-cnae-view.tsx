"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CnaeEscopoRow,
  ConsultaVendasCnaeDetalheResultado,
  ConsultaVendasCnaeResultado,
  ConsultaVendasLinha,
} from "@plataforma/contracts";
import { PADRAO_EMPRESA, TODOS } from "@/components/consultas/periodo-consulta";
import {
  CortinaParametros,
  Resumo,
  celula,
  moeda,
  useFiltrosConsulta,
  valorExtra,
  type FiltroExtra,
} from "@/components/consultas/filtros-consulta";
import { apiFetch } from "@/lib/api-client";
import {
  exportarConsultaExcel,
  exportarConsultaPdf,
  type LinhaExportavel,
} from "@/lib/consulta-export";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Inbox,
  ListOrdered,
  Search,
  SlidersHorizontal,
} from "lucide-react";

const ROTA = "/consultas/vendas-cnae";
const ROTINA = "consulta-vendas-cnae";
const TITULO = "Vendas por CNAE";

type OrdenarPor = "descricao" | "total" | "media";

/** Um nó qualquer da árvore (CNAE ou produto), visto só pelo que têm em comum. */
type No = ConsultaVendasLinha & { filhos?: No[] };

/** Uma linha já pronta para a tabela: o nó, o CNAE ancestral (pro drill-down), a profundidade e a chave. */
interface LinhaAchatada {
  /** Única na tabela inteira — o caminho até o nó, não o seu id. */
  chave: string;
  nivel: number;
  tipo: "CNAE" | "Produto";
  /** id do CNAE raiz (ou SEM_CNAE_ID) acima desta linha — undefined no próprio nível CNAE. */
  cnaeId: string | undefined;
  no: No;
}

/** Casa o termo de busca no que o usuário vê da linha: descrição e código. */
const casa = (no: No, termo: string) =>
  no.descricao.toLowerCase().includes(termo) ||
  (no.codigo ?? "").toLowerCase().includes(termo);

/**
 * Poda a árvore pelo termo de busca, mantendo o caminho inteiro até quem casa
 * — mesma regra da consulta por categoria (ver o comentário lá).
 */
function podar(nos: No[], termo: string): No[] {
  return nos.flatMap((no) => {
    if (casa(no, termo)) return [no];
    const filhos = podar(no.filhos ?? [], termo);
    return filhos.length > 0 ? [{ ...no, filhos }] : [];
  });
}

/**
 * Tela da consulta de vendas por CNAE: a mesma tabela pivô das outras
 * consultas, com as linhas em árvore de dois níveis (CNAE do cliente →
 * produto) que abrem e fecham no clique. O produto é folha — um botão nela
 * abre o drill-down por cliente/nota (ver DetalheDialog), que é a lista crua
 * por trás do total daquela célula.
 */
export function ConsultaVendasCnaeView() {
  const estado = useFiltrosConsulta(["cnaeId"]);
  const { filtros, rascunho, queryPadrao, quantidadeFiltros, abrirCortina } =
    estado;

  const [busca, setBusca] = useState("");
  const [sortBy, setSortBy] = useState<OrdenarPor>("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{
    cnaeId: string;
    produtoId: string;
    cnaeLabel: string;
    produtoLabel: string;
  } | null>(null);

  const podeExportar = useAuthStore((s) => s.hasPermission)(ROTINA, "exportar");
  const usuario = useAuthStore((s) => s.user);
  const empresaNome = usuario?.empresas.find(
    (e) => e.empresaId === usuario.empresaAtivaId,
  )?.nomeFantasia;
  const logoUrl = usuario?.empresas.find(
    (e) => e.empresaId === usuario.empresaAtivaId,
  )?.logoUrl;
  const vendedores = useVendedoresEscopo();

  // CNAEs em uso na base (não o catálogo inteiro do IBGE) — mesma fonte do
  // filtro "Ramo" da Posição de Cliente, o que mantém o select pequeno.
  const cnaesEscopoQuery = useQuery({
    queryKey: ["clientes", "cnaes-escopo"],
    queryFn: () =>
      apiFetch<{ data: CnaeEscopoRow[] }>("/clientes/cnaes-escopo", {
        query: {},
      }),
  });

  const filtrosExtras: FiltroExtra[] = [
    {
      chave: "cnaeId",
      label: "CNAE",
      rotuloTodos: "Todos",
      opcoes: (cnaesEscopoQuery.data?.data ?? []).map((c) => ({
        id: c.id,
        descricao: `${c.codigoErp ?? "—"} — ${c.descricao}`,
      })),
    },
  ];

  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", ROTA, queryPadrao],
    queryFn: () =>
      apiFetch<ConsultaVendasCnaeResultado>(ROTA, { query: queryPadrao }),
  });

  const ordenar = useCallback(
    (nos: No[]): No[] => {
      const ordenados = [...nos].sort((a, b) =>
        sortBy === "descricao"
          ? a.descricao.localeCompare(b.descricao, "pt-BR")
          : sortBy === "media"
            ? a.media - b.media
            : a.total - b.total,
      );
      return sortOrder === "desc" ? ordenados.reverse() : ordenados;
    },
    [sortBy, sortOrder],
  );

  const termo = busca.trim().toLowerCase();
  const arvore: No[] = useMemo(() => {
    if (!data) return [];
    return termo ? podar(data.linhas, termo) : data.linhas;
  }, [data, termo]);

  const linhas = useMemo(() => {
    const abertoTudo = termo.length > 0;
    const saida: LinhaAchatada[] = [];
    const descer = (
      nos: No[],
      nivel: number,
      prefixo: string,
      cnaeId: string | undefined,
    ) => {
      for (const no of ordenar(nos)) {
        const chave = `${prefixo}${no.id}`;
        const tipo: "CNAE" | "Produto" = nivel === 0 ? "CNAE" : "Produto";
        saida.push({ chave, nivel, tipo, cnaeId, no });
        if (no.filhos && (abertoTudo || expandidos.has(chave))) {
          descer(no.filhos, nivel + 1, `${chave}/`, nivel === 0 ? no.id : cnaeId);
        }
      }
    };
    descer(arvore, 0, "", undefined);
    return saida;
  }, [arvore, ordenar, expandidos, termo]);

  const chavesExpansiveis = useMemo(() => {
    const chaves: string[] = [];
    const descer = (nos: No[], prefixo: string) => {
      for (const no of nos) {
        if (!no.filhos || no.filhos.length === 0) continue;
        const chave = `${prefixo}${no.id}`;
        chaves.push(chave);
        descer(no.filhos, `${chave}/`);
      }
    };
    descer(arvore, "");
    return chaves;
  }, [arvore]);

  const tudoExpandido =
    chavesExpansiveis.length > 0 &&
    chavesExpansiveis.every((c) => expandidos.has(c));

  const alternarNo = (chave: string) =>
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(chave)) proximo.add(chave);
      return proximo;
    });

  const alternarOrdem = (coluna: OrdenarPor) => {
    if (sortBy === coluna) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(coluna);
      setSortOrder(coluna === "descricao" ? "asc" : "desc");
    }
  };

  const nomeVendedorFiltrado =
    filtros.vendedorIds.length === 0
      ? null
      : filtros.vendedorIds.length === 1
        ? ((vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorIds[0])
            ?.nomeReduzido ?? null)
        : `${filtros.vendedorIds.length} vendedores`;

  const exportar = async (formato: "pdf" | "excel") => {
    if (!data) return;
    const linhasDoArquivo: LinhaExportavel[] = linhas.map(
      ({ no, nivel, tipo }) => ({
        id: no.id,
        codigo: no.codigo,
        descricao: no.descricao,
        valores: no.valores,
        total: no.total,
        media: no.media,
        nivel,
        rotuloNivel: tipo,
      }),
    );
    const params = {
      resultado: { ...data, linhas: linhasDoArquivo },
      titulo: TITULO,
      rotuloEntidade: "CNAE / Produto",
      empresaNome,
      logoUrl,
      colunaNivel: "Nível",
      contextoExtra: [
        tudoExpandido
          ? "Árvore inteira"
          : "Somente os níveis expandidos na tela",
      ],
    };
    try {
      if (formato === "pdf") await exportarConsultaPdf(params);
      else await exportarConsultaExcel(params);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    }
  };

  const nomeFiltrado = (chave: string) => {
    const valor = valorExtra(filtros, chave);
    if (valor === TODOS) return "Todos";
    return filtrosExtras
      .find((f) => f.chave === chave)
      ?.opcoes.find((o) => o.id === valor)?.descricao ?? "Todos";
  };

  // Parâmetros do drill-down: período/vendedor/base iguais aos da árvore,
  // trocando só o CNAE (o do nó clicado, não o do filtro da cortina) e o
  // produto.
  const parametrosDetalhe = (cnaeId: string, produtoId: string) => ({
    anoInicial: filtros.anoInicial,
    mesInicial: filtros.mesInicial,
    anoFinal: filtros.anoFinal,
    mesFinal: filtros.mesFinal,
    vendedorIds:
      filtros.vendedorIds.length > 0 ? filtros.vendedorIds.join(",") : undefined,
    baseVendedor:
      filtros.baseVendedor === PADRAO_EMPRESA ? undefined : filtros.baseVendedor,
    cnaeId,
    produtoId,
  });

  const detalheQuery = useQuery({
    queryKey: ["consultas", ROTA, "detalhe", detalhe],
    queryFn: () =>
      apiFetch<ConsultaVendasCnaeDetalheResultado>(`${ROTA}/detalhe`, {
        query: detalhe
          ? parametrosDetalhe(detalhe.cnaeId, detalhe.produtoId)
          : {},
      }),
    enabled: !!detalhe,
  });

  return (
    <div data-tour="consulta" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{TITULO}</h1>
        <div className="flex flex-wrap gap-2">
          <Button data-tour="consulta-parametros" variant="outline" size="sm" onClick={() => abrirCortina(true)}>
            <SlidersHorizontal className="size-4" />
            Parâmetros
            {quantidadeFiltros > 0 && (
              <Badge variant="secondary" className="ml-1">
                {quantidadeFiltros}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={chavesExpansiveis.length === 0}
            onClick={() =>
              setExpandidos(tudoExpandido ? new Set() : new Set(chavesExpansiveis))
            }
          >
            {tudoExpandido ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {tudoExpandido ? "Recolher tudo" : "Expandir tudo"}
          </Button>
          {podeExportar && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={linhas.length === 0}
                data-tour="consulta-exportar"
                onClick={() => exportar("pdf")}
              >
                <FileText className="size-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={linhas.length === 0}
                onClick={() => exportar("excel")}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
            </>
          )}
        </div>
      </div>

      <Card data-tour="consulta-resumo">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedorFiltrado ?? "Todos"} />
          <Resumo label="CNAE" valor={nomeFiltrado("cnaeId")} />
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
              placeholder="Buscar CNAE ou produto..."
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <CortinaParametros estado={estado} filtrosExtras={filtrosExtras} />

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
              {arvore.length.toLocaleString("pt-BR")} de{" "}
              {data.linhas.length.toLocaleString("pt-BR")}{" "}
              {data.linhas.length === 1 ? "CNAE" : "CNAEs"} ·{" "}
              {data.baseVendedor === "cliente"
                ? "vendedor titular do cliente"
                : "vendedor da nota"}
            </p>
            <p className="text-xs text-muted-foreground">
              Clique no CNAE para abrir os produtos, e no ícone de lista para ver as
              vendas por cliente/nota daquele produto.
            </p>
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border">
              <Table
                className="w-full table-fixed"
                style={{
                  minWidth: Math.max(760, 260 + data.colunas.length * 88),
                }}
              >
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableTableHead
                      label="CNAE / Produto"
                      className="w-[22%] px-2"
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
                      className="px-1.5 text-right"
                      active={sortBy === "total"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("total")}
                    />
                    <SortableTableHead
                      label="Média"
                      className="px-1.5 text-right"
                      active={sortBy === "media"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("media")}
                    />
                    <TableHead className="w-9 px-1.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(({ chave, nivel, tipo, cnaeId, no }) => {
                    const expansivel = !!no.filhos && no.filhos.length > 0;
                    const aberto = termo.length > 0 || expandidos.has(chave);
                    return (
                      <TableRow
                        key={chave}
                        className={
                          nivel === 0 ? "bg-muted/40 font-medium" : undefined
                        }
                      >
                        <TableCell
                          className="px-2 align-top whitespace-normal"
                          style={{ paddingLeft: 8 + nivel * 16 }}
                        >
                          <div className="flex items-start gap-1">
                            {expansivel ? (
                              <button
                                type="button"
                                onClick={() => alternarNo(chave)}
                                aria-expanded={aberto}
                                className="mt-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                {aberto ? (
                                  <ChevronDown className="size-3.5" />
                                ) : (
                                  <ChevronRight className="size-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs break-words hyphens-auto">
                                {no.descricao}
                              </p>
                              {no.codigo && (
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {no.codigo}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {no.valores.map((v, i) => (
                          <TableCell
                            key={i}
                            className="px-1.5 text-right align-top text-[11px] tabular-nums"
                          >
                            {celula(v)}
                          </TableCell>
                        ))}
                        <TableCell className="px-1.5 text-right align-top text-[11px] font-medium tabular-nums">
                          {moeda(no.total)}
                        </TableCell>
                        <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums">
                          {celula(no.media)}
                        </TableCell>
                        <TableCell className="px-1.5 align-top">
                          {tipo === "Produto" && cnaeId && (
                            <button
                              type="button"
                              title="Ver vendas por cliente/nota"
                              className="rounded text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={() =>
                                setDetalhe({
                                  cnaeId,
                                  produtoId: no.id,
                                  cnaeLabel:
                                    linhas.find(
                                      (l) => l.nivel === 0 && l.no.id === cnaeId,
                                    )?.no.descricao ?? "",
                                  produtoLabel: no.descricao,
                                })
                              }
                            >
                              <ListOrdered className="size-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
                    <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                      {celula(data.media)}
                    </TableCell>
                    <TableCell className="px-1.5" />
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detalhe ? `${detalhe.cnaeLabel} · ${detalhe.produtoLabel}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detalheQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !detalheQuery.data || detalheQuery.data.linhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Inbox className="size-6" />
              Nenhuma venda encontrada para este CNAE e produto no período.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {detalheQuery.data.linhas.length.toLocaleString("pt-BR")} nota(s) ·
                Quantidade: {detalheQuery.data.quantidadeTotal.toLocaleString("pt-BR")} ·
                Valor: {moeda(detalheQuery.data.total)}
              </p>
              <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="px-2">Cliente</TableHead>
                      <TableHead className="px-2">Nota</TableHead>
                      <TableHead className="px-2">Emissão</TableHead>
                      <TableHead className="px-2 text-right">Quantidade</TableHead>
                      <TableHead className="px-2 text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalheQuery.data.linhas.map((l) => (
                      <TableRow key={`${l.notaSaidaId}-${l.clienteId}`}>
                        <TableCell className="px-2 text-xs">
                          <p>{l.clienteNome}</p>
                          {l.clienteCodigo && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {l.clienteCodigo}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-2 text-xs">
                          {l.notaFiscal ?? "—"}
                        </TableCell>
                        <TableCell className="px-2 text-xs">
                          {new Date(l.emissao).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="px-2 text-right text-xs tabular-nums">
                          {l.quantidade.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="px-2 text-right text-xs tabular-nums">
                          {moeda(l.vlrItem)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
