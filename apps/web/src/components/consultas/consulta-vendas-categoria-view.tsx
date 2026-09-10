"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SEM_SUBCATEGORIA_ID,
  type Categoria,
  type ConsultaVendasCategoriaResultado,
  type ConsultaVendasLinha,
  type ConsultaVendasNoCategoria,
} from "@plataforma/contracts";
import { TODOS } from "@/components/consultas/periodo-consulta";
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
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Search,
  SlidersHorizontal,
} from "lucide-react";

const ROTA = "/consultas/vendas-categoria";
const ROTINA = "consulta-vendas-categoria";
const TITULO = "Vendas por Categoria";

type OrdenarPor = "descricao" | "total" | "media";

/** Um nó qualquer da árvore, visto só pelo que todos têm em comum. */
type No = ConsultaVendasLinha & { filhos?: No[] };

/** O que a linha é. Não se deduz da profundidade: com o degrau da
 *  subcategoria suprimido, um produto aparece na profundidade 1. */
type TipoDeNo = "Categoria" | "Subcategoria" | "Produto";

/** Uma linha já pronta para a tabela: o nó, a profundidade e a chave. */
interface LinhaAchatada {
  /** Única na tabela inteira. "(Sem subcategoria)" repete entre categorias,
   *  então a chave de um nó é o caminho até ele, não o seu id. */
  chave: string;
  nivel: number;
  tipo: TipoDeNo;
  no: No;
}

/**
 * Suprime o degrau "(Sem subcategoria)" quando ele é o único filho da
 * categoria — isto é, quando nenhum produto dela tem subcategoria no
 * cadastro. Os produtos passam a pender direto da categoria.
 *
 * Sem isso, uma empresa que não usa subcategoria (ou uma categoria em que ela
 * não foi preenchida) ganha um nível inteiro de "(Sem subcategoria)" entre a
 * categoria e o produto, repetindo o mesmo total e custando um clique a mais
 * para chegar a qualquer coisa. Onde há subcategoria de verdade, mesmo que
 * junto com produtos sem ela, os três níveis continuam aparecendo.
 */
function suprimirSubcategoriaVazia(
  categorias: ConsultaVendasNoCategoria[],
): No[] {
  return categorias.map((cat) => {
    const unico = cat.filhos.length === 1 ? cat.filhos[0] : undefined;
    return unico?.id === SEM_SUBCATEGORIA_ID
      ? { ...cat, filhos: unico.filhos }
      : cat;
  });
}

/** Casa o termo de busca no que o usuário vê da linha: descrição e código. */
const casa = (no: No, termo: string) =>
  no.descricao.toLowerCase().includes(termo) ||
  (no.codigo ?? "").toLowerCase().includes(termo);

/**
 * Poda a árvore pelo termo de busca, mantendo o caminho inteiro até quem casa.
 *
 * Um produto encontrado precisa aparecer sob a categoria e a subcategoria
 * dele — o resultado solto não diz onde ele está, que é metade da resposta
 * desta consulta. Categoria que casa traz os filhos todos junto.
 *
 * Os totais dos nós que sobram continuam sendo os do relatório inteiro, não os
 * do que a busca deixou visível: a busca é uma lente para achar uma linha, e a
 * categoria tem de seguir dizendo quanto ela vendeu — a mesma regra do rodapé
 * nas outras consultas.
 */
function podar(nos: No[], termo: string): No[] {
  return nos.flatMap((no) => {
    if (casa(no, termo)) return [no];
    const filhos = podar(no.filhos ?? [], termo);
    return filhos.length > 0 ? [{ ...no, filhos }] : [];
  });
}

/**
 * Tela da consulta de vendas por categoria: a mesma tabela pivô das outras
 * consultas, com as linhas em árvore de três níveis (categoria →
 * subcategoria → produto) que abrem e fecham no clique.
 *
 * A árvore inteira vem numa requisição só, como nas demais consultas: o
 * período tem no máximo 12 meses, e carregar os produtos sob demanda custaria
 * uma ida ao banco por clique para dado que já foi somado uma vez.
 */
export function ConsultaVendasCategoriaView() {
  const estado = useFiltrosConsulta(["categoriaId", "subCategoriaId"]);
  const { filtros, rascunho, queryPadrao, quantidadeFiltros, abrirCortina } =
    estado;

  const [busca, setBusca] = useState("");
  const [sortBy, setSortBy] = useState<OrdenarPor>("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  /** Chaves dos nós abertos. Tudo fechado no início: a leitura começa pelo
   *  ranking de categorias, e o detalhe vem quando é pedido. */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const podeExportar = useAuthStore((s) => s.hasPermission)(ROTINA, "exportar");
  const usuario = useAuthStore((s) => s.user);
  const empresaNome = usuario?.empresas.find(
    (e) => e.empresaId === usuario.empresaAtivaId,
  )?.nomeFantasia;
  const vendedores = useVendedoresEscopo();

  // Só categorias raiz no primeiro select, como no formulário de Objetivos —
  // a árvore inteira num select de filtro é grande demais para navegar.
  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raiz"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: true },
      }),
  });

  // As subcategorias dependem da categoria que está no RASCUNHO, não na
  // consulta aplicada: o segundo select tem de reagir enquanto a cortina
  // ainda está aberta, antes de alguém clicar em Aplicar.
  const categoriaDoRascunho = valorExtra(rascunho, "categoriaId");
  const subcategoriasQuery = useQuery({
    queryKey: ["categorias", "select", "filhas", categoriaDoRascunho],
    enabled: categoriaDoRascunho !== TODOS,
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        // 100 é o teto do paginationQuerySchema; acima disso a API recusa.
        query: { pageSize: 100, categoriaPaiId: categoriaDoRascunho },
      }),
  });

  const filtrosExtras: FiltroExtra[] = [
    {
      chave: "categoriaId",
      label: "Categoria",
      rotuloTodos: "Todas",
      opcoes: (categoriasQuery.data?.data ?? []).map((c) => ({
        id: c.id,
        descricao: c.descricao,
      })),
      // Trocar a categoria invalida a subcategoria escolhida: o par não
      // existiria, e a consulta voltaria vazia sem dizer por quê.
      limpaAoMudar: ["subCategoriaId"],
    },
    {
      chave: "subCategoriaId",
      label: "Subcategoria",
      rotuloTodos: "Todas",
      opcoes: (subcategoriasQuery.data?.data ?? []).map((c) => ({
        id: c.id,
        descricao: c.descricao,
      })),
      desabilitado: categoriaDoRascunho === TODOS,
      ajuda:
        categoriaDoRascunho === TODOS
          ? "Escolha uma categoria para filtrar por subcategoria."
          : undefined,
    },
  ];

  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", ROTA, queryPadrao],
    queryFn: () =>
      apiFetch<ConsultaVendasCategoriaResultado>(ROTA, { query: queryPadrao }),
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
    const nos = suprimirSubcategoriaVazia(data.linhas);
    return termo ? podar(nos, termo) : nos;
  }, [data, termo]);

  /**
   * As linhas na ordem em que a tabela as desenha. Buscando, tudo o que
   * sobrou da poda aparece aberto: esconder o resultado atrás de um clique
   * anularia a busca.
   */
  const linhas = useMemo(() => {
    const abertoTudo = termo.length > 0;
    const saida: LinhaAchatada[] = [];
    const descer = (nos: No[], nivel: number, prefixo: string) => {
      for (const no of ordenar(nos)) {
        const chave = `${prefixo}${no.id}`;
        const tipo: TipoDeNo =
          nivel === 0 ? "Categoria" : no.filhos ? "Subcategoria" : "Produto";
        saida.push({ chave, nivel, tipo, no });
        if (no.filhos && (abertoTudo || expandidos.has(chave))) {
          descer(no.filhos, nivel + 1, `${chave}/`);
        }
      }
    };
    descer(arvore, 0, "");
    return saida;
  }, [arvore, ordenar, expandidos, termo]);

  /** Todas as chaves que abrem alguma coisa — o botão "Expandir tudo". */
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

  // Um nome cabe no resumo; vários viram contagem, senão a linha estoura.
  const nomeVendedorFiltrado =
    filtros.vendedorIds.length === 0
      ? null
      : filtros.vendedorIds.length === 1
        ? ((vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorIds[0])
            ?.nomeReduzido ?? null)
        : `${filtros.vendedorIds.length} vendedores`;

  /**
   * O arquivo sai com o que está aberto na tela, e só isso — foi a decisão de
   * quem usa: a expansão é o recorte do relatório, não uma conveniência de
   * navegação. O rodapé continua sendo o total geral do período, para o
   * arquivo não parecer somar só a parte visível.
   */
  const exportar = (formato: "pdf" | "excel") => {
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
      rotuloEntidade: "Categoria / Subcategoria / Produto",
      empresaNome,
      colunaNivel: "Nível",
      contextoExtra: [
        ...(data.subCategoria
          ? [`Subcategoria: ${data.subCategoria.descricao}`]
          : []),
        tudoExpandido
          ? "Árvore inteira"
          : "Somente os níveis expandidos na tela",
      ],
    };
    try {
      if (formato === "pdf") exportarConsultaPdf(params);
      else exportarConsultaExcel(params);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    }
  };

  const nomeFiltrado = (chave: string) => {
    const valor = valorExtra(filtros, chave);
    if (valor === TODOS) return "Todas";
    const filtro = filtrosExtras.find((f) => f.chave === chave);
    return filtro?.opcoes.find((o) => o.id === valor)?.descricao ?? "Todas";
  };

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

      {/* Resumo do que está valendo: com os filtros na cortina, a tela
          precisa dizer sozinha de que recorte é o número exibido. */}
      <Card data-tour="consulta-resumo">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedorFiltrado ?? "Todos"} />
          <Resumo label="Categoria" valor={nomeFiltrado("categoriaId")} />
          <Resumo label="Subcategoria" valor={nomeFiltrado("subCategoriaId")} />
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
              placeholder="Buscar categoria ou produto..."
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
              {data.linhas.length === 1 ? "categoria" : "categorias"} ·{" "}
              {data.baseVendedor === "cliente"
                ? "vendedor titular do cliente"
                : "vendedor da nota"}
            </p>
            <p className="text-xs text-muted-foreground">
              Clique na categoria para abrir as subcategorias, e na subcategoria
              para ver os produtos.
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
                      label="Categoria / Produto"
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(({ chave, nivel, no }) => {
                    const expansivel = !!no.filhos && no.filhos.length > 0;
                    const aberto = termo.length > 0 || expandidos.has(chave);
                    return (
                      <TableRow
                        key={chave}
                        // A categoria é o resumo do que vem abaixo: sem um peso
                        // diferente por nível, a tabela aberta vira uma lista
                        // plana e o agrupamento some.
                        className={
                          nivel === 0
                            ? "bg-muted/40 font-medium"
                            : nivel === 1
                              ? "bg-muted/15"
                              : undefined
                        }
                      >
                        {/* `whitespace-normal` desfaz o `whitespace-nowrap` que
                            TableCell aplica por padrão: sem isso o texto invade
                            a coluna do primeiro mês em vez de quebrar. */}
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
                              // Espaço do chevron, para o produto alinhar com o
                              // texto do pai em vez de com a seta dele.
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
