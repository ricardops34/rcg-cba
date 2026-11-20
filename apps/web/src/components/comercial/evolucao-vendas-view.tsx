"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Filtro } from "@/components/comercial/mapa-clientes-dialog";
import {
  GraficoEvolucao,
  TIPOS_GRAFICO_EVOLUCAO,
  type SerieEvolucao,
  type TipoGraficoEvolucao,
} from "@/components/consultas/grafico-evolucao";
import {
  anosDisponiveis,
  erroDoPeriodo,
  percentualDoTotal,
  periodoPadrao,
  type PeriodoFiltros,
} from "@/components/consultas/periodo-consulta";

const TODOS = "todos";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MAX_SERIES = 6;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const celula = (v: number) =>
  v === 0 ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
 * categoria, cliente ou CNAE, com produto e cliente no detalhe, % do total e
 * gráficos. O escopo de carteira (hierarquia) é do servidor.
 */
export function EvolucaoVendasView() {
  const [visao, setVisao] = useState<EvolucaoVendasVisao>("categoria");
  const [periodo, setPeriodo] = useState<PeriodoFiltros>(periodoPadrao);
  const [uf, setUf] = useState(TODOS);
  const [municipio, setMunicipio] = useState(TODOS);
  const [categoriaId, setCategoriaId] = useState(TODOS);
  const [cnaeId, setCnaeId] = useState(TODOS);
  const [vendedorId, setVendedorId] = useState(TODOS);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [tipoGrafico, setTipoGrafico] = useState<TipoGraficoEvolucao>("linha");

  const valor = (v: string) => (v === TODOS ? undefined : v);
  const erroPeriodo = erroDoPeriodo(periodo);

  const ufs = useQuery({
    queryKey: ["clientes", "ufs-escopo", valor(municipio), valor(vendedorId)],
    queryFn: () =>
      apiFetch<{ data: { uf: string; total: number }[] }>("/clientes/ufs-escopo", {
        query: { municipio: valor(municipio), vendedorId: valor(vendedorId) },
      }),
  });
  const municipios = useQuery({
    queryKey: ["clientes", "municipios-escopo", valor(uf), valor(vendedorId)],
    queryFn: () =>
      apiFetch<{ data: { municipio: string; total: number }[] }>("/clientes/municipios-escopo", {
        query: { uf: valor(uf), vendedorId: valor(vendedorId) },
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
  const vendedores = useVendedoresEscopo({ apenasComCliente: true });

  const query = {
    visao,
    anoInicial: Number(periodo.anoInicial),
    mesInicial: Number(periodo.mesInicial),
    anoFinal: Number(periodo.anoFinal),
    mesFinal: Number(periodo.mesFinal),
    uf: valor(uf),
    municipio: valor(municipio),
    categoriaId: valor(categoriaId),
    cnaeId: valor(cnaeId),
    produtoId: produtoId ?? undefined,
    vendedorIds: valor(vendedorId),
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", "evolucao-vendas", query],
    queryFn: () => apiFetch<EvolucaoVendasResultado>("/consultas/evolucao-vendas", { query }),
    enabled: !erroPeriodo,
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

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });

  const anos = anosDisponiveis().map((a) => ({ valor: String(a), rotulo: String(a) }));
  const mesesOpcoes = MESES.map((m, i) => ({ valor: String(i + 1), rotulo: m }));
  const muda = (campo: keyof PeriodoFiltros) => (v: string) =>
    setPeriodo((p) => ({ ...p, [campo]: v }));

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Evolução de Vendas</h1>
        <p className="text-sm text-muted-foreground">
          Venda do período por categoria, cliente ou CNAE, com produto e cliente no detalhe. Você vê
          a sua carteira (ou a da sua equipe).
        </p>
      </div>

      <Tabs value={visao} onValueChange={(v) => { setVisao(v as EvolucaoVendasVisao); setAbertos(new Set()); }}>
        <TabsList>
          {EVOLUCAO_VENDAS_VISOES.map((v) => (
            <TabsTrigger key={v} value={v}>
              {EVOLUCAO_VENDAS_VISAO_ROTULO[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">De</span>
            <Filtro rotulo="" valor={periodo.mesInicial} onChange={muda("mesInicial")} opcoes={mesesOpcoes} largura="w-20" />
            <Filtro rotulo="" valor={periodo.anoInicial} onChange={muda("anoInicial")} opcoes={anos} largura="w-24" />
            <span className="text-xs font-medium text-muted-foreground">até</span>
            <Filtro rotulo="" valor={periodo.mesFinal} onChange={muda("mesFinal")} opcoes={mesesOpcoes} largura="w-20" />
            <Filtro rotulo="" valor={periodo.anoFinal} onChange={muda("anoFinal")} opcoes={anos} largura="w-24" />
            {erroPeriodo && <span className="text-xs text-destructive">{erroPeriodo}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Filtro
              rotulo="UF"
              valor={uf}
              onChange={(v) => { setUf(v); setMunicipio(TODOS); }}
              opcoes={[{ valor: TODOS, rotulo: "Todas" }, ...(ufs.data?.data ?? []).map((u) => ({ valor: u.uf, rotulo: u.uf }))]}
              largura="w-24"
            />
            <Filtro
              rotulo="Município"
              valor={municipio}
              onChange={setMunicipio}
              opcoes={[{ valor: TODOS, rotulo: "Todos" }, ...(municipios.data?.data ?? []).map((m) => ({ valor: m.municipio, rotulo: m.municipio }))]}
              largura="w-52"
            />
            <Filtro
              rotulo="Categoria"
              valor={categoriaId}
              onChange={setCategoriaId}
              opcoes={[{ valor: TODOS, rotulo: "Todas" }, ...(opcoes.data?.categorias ?? []).map((c) => ({ valor: c.id, rotulo: `${c.codigo ?? ""} ${c.descricao}`.trim() }))]}
              largura="w-52"
            />
            <Filtro
              rotulo="CNAE"
              valor={cnaeId}
              onChange={setCnaeId}
              opcoes={[{ valor: TODOS, rotulo: "Todos" }, ...(cnaes.data?.data ?? []).map((c) => ({ valor: c.id, rotulo: `${c.codigoErp ?? ""} ${c.descricao}`.trim() }))]}
              largura="w-60"
            />
            {!vendedores.data?.restrito && (
              <Filtro
                rotulo="Vendedor"
                valor={vendedorId}
                onChange={setVendedorId}
                opcoes={[
                  { valor: TODOS, rotulo: "Todos" },
                  ...(vendedores.data?.data ?? []).filter((v) => v.totalClientes > 0).map((v) => ({ valor: v.id, rotulo: v.nome })),
                ]}
                largura="w-52"
              />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Produto</span>
              <div className="w-72">
                <ProdutoCombobox value={produtoId} onChange={(p) => setProdutoId(p?.id ?? null)} placeholder="Todos os produtos" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar a evolução de vendas.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Resumo titulo="Total do período" valor={moeda(data.total)} />
            <Resumo titulo="Quantidade" valor={numero(data.quantidade)} />
            <Resumo
              titulo="Média por mês"
              valor={moeda(data.colunas.length ? data.total / data.colunas.length : 0)}
            />
            <Resumo
              titulo={visao === "categoria" ? "Categorias" : visao === "cliente" ? "Clientes" : "CNAEs"}
              valor={String(data.linhas.length)}
            />
          </div>

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
                  <GraficoEvolucao meses={meses} series={series} formato="moeda" rotuloValor="Venda" tipo={tipoGrafico} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2">
                <p className="text-sm font-semibold">Participação no total</p>
                {data.linhas.slice(0, 10).map((l, i) => {
                  const pct = data.total ? (l.total / data.total) * 100 : 0;
                  return (
                    <div key={l.id} className="space-y-0.5">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate" title={l.descricao}>{l.descricao}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {percentualDoTotal(l.total, data.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${Math.max(pct, 0.5)}%`,
                            background: i < MAX_SERIES ? `var(--viz-${i + 1})` : "var(--muted-foreground)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.linhas.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    Os 10 maiores de {data.linhas.length}.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {data.periodo.label}. Clique para abrir o detalhe.
                </p>
                <div className="relative ml-auto w-full sm:max-w-64">
                  <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto rounded-lg border">
                <Table className="w-full table-fixed" style={{ minWidth: Math.max(900, 420 + data.colunas.length * 88) }}>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-[26%] px-2">{ROTULO_NIVEL[visao]}</TableHead>
                      {data.colunas.map((c) => (
                        <TableHead key={c.label} className="px-1.5 text-right text-xs whitespace-nowrap">
                          {c.label}
                        </TableHead>
                      ))}
                      <TableHead className="px-1.5 text-right text-xs">Total</TableHead>
                      <TableHead className="w-[70px] px-1.5 text-right text-xs">% do total</TableHead>
                      <TableHead className="w-[90px] px-1.5 text-right text-xs">Qtd.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={data.colunas.length + 4} className="text-center text-xs text-muted-foreground">
                          Nada encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {visiveis.map(({ no, nivel, chave }) => {
                      const expansivel = no.filhos.length > 0;
                      const aberto = termo.length > 0 || abertos.has(chave);
                      return (
                        <Fragment key={chave}>
                          <TableRow
                            className={nivel === 0 ? "bg-muted/40 font-medium" : nivel === 1 ? "bg-muted/15" : undefined}
                          >
                            <TableCell className="px-2 align-top whitespace-normal" style={{ paddingLeft: 8 + nivel * 16 }}>
                              <div className="flex items-start gap-1">
                                {expansivel ? (
                                  <button
                                    type="button"
                                    onClick={() => alternar(chave)}
                                    aria-expanded={aberto}
                                    className="mt-0.5 rounded text-muted-foreground hover:text-foreground"
                                  >
                                    {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
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
                                {/* Parte do total do mês (20/11/2026). */}
                                {v !== 0 && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    {percentualDoTotal(v, data.totais[i])}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="px-1.5 text-right align-top text-[11px] font-medium tabular-nums">
                              {moeda(no.total)}
                            </TableCell>
                            <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums text-muted-foreground">
                              {percentualDoTotal(no.total, data.total)}
                            </TableCell>
                            <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums">
                              {numero(no.quantidade)}
                              {no.tipo === "produto" && no.unidade ? ` ${no.unidade}` : ""}
                            </TableCell>
                          </TableRow>
                        </Fragment>
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
                      <TableCell className="px-1.5 text-right text-[11px] tabular-nums">{moeda(data.total)}</TableCell>
                      <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                        {data.total ? "100,0%" : "—"}
                      </TableCell>
                      <TableCell className="px-1.5 text-right text-[11px] tabular-nums">{numero(data.quantidade)}</TableCell>
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

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  );
}
