"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import {
  EVOLUCAO_VENDAS_VISAO_ROTULO,
  EVOLUCAO_VENDAS_VISOES,
  type CnaeEscopoRow,
  type EvolucaoVendasNo,
  type EvolucaoVendasOpcoes,
  type EvolucaoVendasResultado,
  type EvolucaoVendasVisao,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Filtro } from "@/components/comercial/mapa-clientes-dialog";
import {
  CortinaParametros,
  Resumo,
  celula,
  useFiltrosConsulta,
  valorExtra,
  type FiltroExtra,
} from "@/components/consultas/filtros-consulta";
import {
  TIPOS_GRAFICO_EVOLUCAO,
  type SerieEvolucao,
  type TipoGraficoEvolucao,
} from "@/components/consultas/grafico-evolucao";
import {
  GraficoEvolucaoMensal,
  GraficoParticipacao,
  type FormaParticipacao,
  type ItemParticipacao,
} from "@/components/comercial/evolucao-vendas-graficos";
import { TODOS, percentualDoTotal } from "@/components/consultas/periodo-consulta";

const MAX_SERIES = 6;
const CHAVES_EXTRAS = ["uf", "municipio", "categoriaId", "cnaeId", "produtoId"];

const moedaBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const desconto = (v: number | null | undefined) =>
  v == null
    ? "—"
    : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const ROTULO_NIVEL: Record<EvolucaoVendasVisao, string> = {
  categoria: "Categoria / Produto / Cliente",
  cliente: "Cliente / Produto",
  cnae: "CNAE / Produto / Cliente",
};

/** Mantém o nó que casa com a busca ou que tem descendente que casa. */
function podar(nos: EvolucaoVendasNo[], termo: string): EvolucaoVendasNo[] {
  if (!termo) return nos;
  return nos.flatMap((n) => {
    const casa = `${n.descricao} ${n.codigo ?? ""}`.toLowerCase().includes(termo);
    if (casa) return [n];
    const filhos = podar(n.filhos, termo);
    return filhos.length ? [{ ...n, filhos }] : [];
  });
}

/**
 * Comercial > Evolução de Vendas (20/11/2026,
 * docs/planos/2026-11-20-evolucao-vendas-comercial.md): a venda do período por
 * categoria, cliente ou CNAE, com produto e cliente no detalhe. No padrão das
 * Consultas: parâmetros na cortina, faixa de resumo, e cada visão com as
 * sub-abas Dados e Gráfico. O escopo de carteira (hierarquia) é do servidor.
 */
export function EvolucaoVendasView() {
  const [visao, setVisao] = useState<EvolucaoVendasVisao>("categoria");
  const [subAba, setSubAba] = useState<"dados" | "grafico">("dados");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [tipoGrafico, setTipoGrafico] = useState<TipoGraficoEvolucao>("linha");
  const [formaParticipacao, setFormaParticipacao] = useState<FormaParticipacao>("barras");

  const estado = useFiltrosConsulta(CHAVES_EXTRAS);
  const { filtros, rascunho, setRascunho, abrirCortina, quantidadeFiltros, queryPadrao } = estado;

  // Opções da cortina (o município segue a UF do rascunho).
  const ufRascunho = valorExtra(rascunho, "uf");
  const ufs = useQuery({
    queryKey: ["clientes", "ufs-escopo"],
    queryFn: () =>
      apiFetch<{ data: { uf: string; total: number }[] }>("/clientes/ufs-escopo", { query: {} }),
  });
  const municipios = useQuery({
    queryKey: ["clientes", "municipios-escopo", ufRascunho],
    queryFn: () =>
      apiFetch<{ data: { municipio: string; total: number }[] }>("/clientes/municipios-escopo", {
        query: { uf: ufRascunho === TODOS ? undefined : ufRascunho },
      }),
  });
  const cnaes = useQuery({
    queryKey: ["clientes", "cnaes-escopo"],
    queryFn: () => apiFetch<{ data: CnaeEscopoRow[] }>("/clientes/cnaes-escopo", { query: {} }),
  });
  const opcoes = useQuery({
    queryKey: ["consultas", "evolucao-vendas", "opcoes"],
    queryFn: () => apiFetch<EvolucaoVendasOpcoes>("/consultas/evolucao-vendas/opcoes"),
    staleTime: 10 * 60_000,
  });
  const vendedores = useVendedoresEscopo();

  const opcoesCategoria = (opcoes.data?.categorias ?? []).map((c) => ({
    id: c.id,
    descricao: `${c.codigo ?? ""} ${c.descricao}`.trim(),
  }));
  const opcoesCnae = (cnaes.data?.data ?? []).map((c) => ({
    id: c.id,
    descricao: `${c.codigoErp ?? ""} ${c.descricao}`.trim(),
  }));
  const filtrosExtras: FiltroExtra[] = [
    {
      chave: "uf",
      label: "Estado",
      rotuloTodos: "Todos",
      opcoes: (ufs.data?.data ?? []).map((u) => ({ id: u.uf, descricao: u.uf })),
      limpaAoMudar: ["municipio"],
    },
    {
      chave: "municipio",
      label: "Município",
      rotuloTodos: "Todos",
      opcoes: (municipios.data?.data ?? []).map((m) => ({ id: m.municipio, descricao: m.municipio })),
    },
    { chave: "categoriaId", label: "Categoria", rotuloTodos: "Todas", opcoes: opcoesCategoria },
    {
      chave: "cnaeId",
      label: "CNAE (principal do cliente)",
      rotuloTodos: "Todos",
      opcoes: opcoesCnae,
    },
  ];
  const produtoRascunho = valorExtra(rascunho, "produtoId");

  const query = { ...queryPadrao, visao };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", "evolucao-vendas", query],
    queryFn: () => apiFetch<EvolucaoVendasResultado>("/consultas/evolucao-vendas", { query }),
  });

  const termo = busca.trim().toLowerCase();
  const linhas = useMemo(() => podar(data?.linhas ?? [], termo), [data, termo]);
  const meses = useMemo(() => (data?.colunas ?? []).map((c) => c.label), [data]);

  // Gráfico: os principais grupos e o resto como "Outros".
  const series = useMemo<SerieEvolucao[]>(() => {
    if (!data) return [];
    const principais = data.linhas.slice(0, MAX_SERIES).map((l, i) => ({
      id: l.id,
      nome: l.descricao,
      valores: l.valores,
      cor: `var(--viz-${i + 1})`,
    }));
    const resto = data.linhas.slice(MAX_SERIES);
    if (resto.length) {
      principais.push({
        id: "outros",
        nome: `Outros (${resto.length})`,
        valores: data.colunas.map((_, k) => resto.reduce((a, l) => a + l.valores[k], 0)),
        cor: "var(--muted-foreground)",
      });
    }
    return principais;
  }, [data]);

  // Participação no total: as mesmas entidades e cores do gráfico mensal.
  const participacao = useMemo<ItemParticipacao[]>(
    () =>
      series.map((s) => ({
        id: s.id,
        nome: s.nome,
        valor: s.valores.reduce((a, v) => a + v, 0),
        cor: s.cor,
      })),
    [series],
  );

  /** Chaves de todos os nós que expandem — para o Expandir tudo. */
  const chavesExpansiveis = useMemo(() => {
    const out: string[] = [];
    const descer = (nos: EvolucaoVendasNo[], pai: string) => {
      for (const no of nos) {
        const chave = `${pai}/${no.tipo}:${no.id}`;
        if (no.filhos.length) {
          out.push(chave);
          descer(no.filhos, chave);
        }
      }
    };
    descer(data?.linhas ?? [], "");
    return out;
  }, [data]);
  const tudoExpandido =
    chavesExpansiveis.length > 0 && chavesExpansiveis.every((c) => abertos.has(c));

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });

  /** Linhas da árvore na ordem de exibição, com o nível. */
  const visiveis = useMemo(() => {
    const out: { no: EvolucaoVendasNo; nivel: number; chave: string }[] = [];
    const descer = (nos: EvolucaoVendasNo[], nivel: number, pai: string) => {
      for (const no of nos) {
        const chave = `${pai}/${no.tipo}:${no.id}`;
        out.push({ no, nivel, chave });
        if (no.filhos.length && (termo || abertos.has(chave))) descer(no.filhos, nivel + 1, chave);
      }
    };
    descer(linhas, 0, "");
    return out;
  }, [linhas, abertos, termo]);

  // Resumo: o nome do que está filtrado (os filtros moram na cortina).
  const nomeDe = (chave: string, opcoesFiltro?: { id: string; descricao: string }[]) => {
    const v = valorExtra(filtros, chave);
    if (v === TODOS) return "Todos";
    return opcoesFiltro?.find((o) => o.id === v)?.descricao ?? v;
  };
  const nomeVendedor =
    filtros.vendedorIds.length === 0
      ? "Todos"
      : filtros.vendedorIds.length === 1
        ? ((vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorIds[0])?.nome ?? "1")
        : `${filtros.vendedorIds.length} vendedores`;
  const produtoEscolhido = valorExtra(filtros, "produtoId") !== TODOS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Evolução de Vendas</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirCortina(true)}>
            <SlidersHorizontal className="size-4" />
            Parâmetros
            {quantidadeFiltros > 0 && (
              <Badge variant="secondary" className="ml-1">
                {quantidadeFiltros}
              </Badge>
            )}
          </Button>
          {subAba === "dados" && (
            <Button
              variant="outline"
              size="sm"
              disabled={chavesExpansiveis.length === 0}
              onClick={() => setAbertos(tudoExpandido ? new Set() : new Set(chavesExpansiveis))}
            >
              {tudoExpandido ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              {tudoExpandido ? "Recolher tudo" : "Expandir tudo"}
            </Button>
          )}
        </div>
      </div>

      {/* Resumo do que está valendo: com os filtros na cortina, a tela
          precisa dizer sozinha de que recorte é o número exibido. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedor} />
          <Resumo label="Estado" valor={nomeDe("uf")} />
          <Resumo label="Município" valor={nomeDe("municipio")} />
          <Resumo label="Categoria" valor={nomeDe("categoriaId", opcoesCategoria)} />
          <Resumo label="CNAE" valor={nomeDe("cnaeId", opcoesCnae)} />
          {produtoEscolhido && <Resumo label="Produto" valor="Filtrado" />}
          <Resumo label="Total" valor={data ? moedaBrl(data.total) : "—"} />
          <Resumo label="Quantidade" valor={data ? numero(data.quantidade) : "—"} />
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
        </CardContent>
      </Card>

      <CortinaParametros
        estado={estado}
        filtrosExtras={filtrosExtras}
        conteudoExtra={
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Produto</p>
            <ProdutoCombobox
              value={produtoRascunho === TODOS ? null : produtoRascunho}
              onChange={(p) =>
                setRascunho((r) => ({ ...r, extras: { ...r.extras, produtoId: p?.id ?? TODOS } }))
              }
              placeholder="Todos os produtos"
            />
          </div>
        }
      />

      {/* Visão (abas) e sub-abas Dados / Gráfico. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={visao}
          onValueChange={(v) => {
            setVisao(v as EvolucaoVendasVisao);
            setAbertos(new Set());
          }}
        >
          <TabsList>
            {EVOLUCAO_VENDAS_VISOES.map((v) => (
              <TabsTrigger key={v} value={v}>
                {EVOLUCAO_VENDAS_VISAO_ROTULO[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={subAba} onValueChange={(v) => setSubAba(v as "dados" | "grafico")}>
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="grafico">Gráfico</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar a evolução de vendas.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : subAba === "grafico" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Evolução mensal</p>
                <Filtro
                  rotulo="Gráfico"
                  valor={tipoGrafico}
                  onChange={(v) => setTipoGrafico(v as TipoGraficoEvolucao)}
                  opcoes={TIPOS_GRAFICO_EVOLUCAO.map((t) => ({ valor: t.valor, rotulo: t.label }))}
                  largura="w-44"
                />
              </div>
              {series.length ? (
                <GraficoEvolucaoMensal meses={meses} series={series} tipo={tipoGrafico} />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Participação no total</p>
                <Tabs
                  value={formaParticipacao}
                  onValueChange={(v) => setFormaParticipacao(v as FormaParticipacao)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="barras" className="text-xs">
                      Barras
                    </TabsTrigger>
                    <TabsTrigger value="rosca" className="text-xs">
                      Rosca
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {participacao.length ? (
                <GraficoParticipacao
                  itens={participacao}
                  total={data.total}
                  forma={formaParticipacao}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
              )}
              {data.linhas.length > MAX_SERIES && (
                <p className="text-xs text-muted-foreground">
                  Os {MAX_SERIES} maiores de {data.linhas.length}; o resto está em Outros.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {data.linhas.length}{" "}
                {visao === "categoria" ? "categorias" : visao === "cliente" ? "clientes" : "CNAEs"}.
                Clique para abrir o detalhe; abaixo de cada mês, a parte do total do mês.
              </p>
              <div className="relative ml-auto w-full sm:max-w-64">
                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-8"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-lg border">
              <Table
                className="w-full table-fixed"
                style={{ minWidth: Math.max(980, 500 + data.colunas.length * 88) }}
              >
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-[24%] px-2">{ROTULO_NIVEL[visao]}</TableHead>
                    {data.colunas.map((c) => (
                      <TableHead key={c.label} className="px-1.5 text-right text-xs whitespace-nowrap">
                        {c.label}
                      </TableHead>
                    ))}
                    <TableHead className="px-1.5 text-right text-xs">Total</TableHead>
                    <TableHead className="w-[70px] px-1.5 text-right text-xs">% do total</TableHead>
                    <TableHead className="w-[90px] px-1.5 text-right text-xs">Qtd.</TableHead>
                    <TableHead
                      className="w-[80px] px-1.5 text-right text-xs"
                      title="Desconto médio sobre a tabela, ponderado pelo valor"
                    >
                      Desc. médio
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={data.colunas.length + 5}
                        className="text-center text-xs text-muted-foreground"
                      >
                        Nada encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {visiveis.map(({ no, nivel, chave }) => {
                    const expansivel = no.filhos.length > 0;
                    const aberto = termo.length > 0 || abertos.has(chave);
                    // Quantidade só onde há um produto só (o produto e o cliente abaixo dele).
                    const qtdFazSentido = no.tipo === "produto" || (no.tipo === "cliente" && nivel > 0);
                    return (
                      <TableRow
                        key={chave}
                        className={
                          nivel === 0 ? "bg-muted/40 font-medium" : nivel === 1 ? "bg-muted/15" : undefined
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
                                onClick={() => alternar(chave)}
                                aria-expanded={aberto}
                                className="mt-0.5 rounded text-muted-foreground hover:text-foreground"
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
                              <p className="text-xs break-words">{no.descricao}</p>
                              {no.codigo && (
                                <p className="font-mono text-[11px] text-muted-foreground">{no.codigo}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {no.valores.map((v, i) => (
                          <TableCell key={i} className="px-1.5 text-right align-top text-[11px] tabular-nums">
                            {celula(v)}
                            {v !== 0 && (
                              <span className="block text-[10px] text-muted-foreground">
                                {percentualDoTotal(v, data.totais[i])}
                              </span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="px-1.5 text-right align-top text-[11px] font-medium tabular-nums">
                          {moedaBrl(no.total)}
                        </TableCell>
                        <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums text-muted-foreground">
                          {percentualDoTotal(no.total, data.total)}
                        </TableCell>
                        <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums">
                          {qtdFazSentido ? numero(no.quantidade) : ""}
                        </TableCell>
                        <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums">
                          {desconto(no.descontoMedio)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <tfoot className="sticky bottom-0 z-10 bg-card">
                  <TableRow className="font-medium">
                    <TableCell className="px-2 text-xs">Total geral</TableCell>
                    {data.totais.map((v, i) => (
                      <TableCell key={i} className="px-1.5 text-right text-[11px] tabular-nums">
                        {celula(v)}
                      </TableCell>
                    ))}
                    <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                      {moedaBrl(data.total)}
                    </TableCell>
                    <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                      {data.total ? "100,0%" : "—"}
                    </TableCell>
                    <TableCell />
                    <TableCell />
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
