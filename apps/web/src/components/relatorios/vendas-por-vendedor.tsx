"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RelatorioOpcao, RelatorioVendasPorVendedorResultado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { VendedoresMultiSelect } from "@/components/crud/vendedores-multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CampoCategorias,
  CampoData,
  descreverFiltros,
  hojeIso,
  mesesAntesIso,
  semVazios,
  useNomeCategoria,
} from "@/components/relatorios/filtros";
import {
  BuscaMultiSelect,
  CampoFiltro,
  PainelFiltros,
  filtrosEmTexto,
  idsDe,
  rotuloOpcao,
  type FiltroAtivo,
} from "@/components/relatorios/filtros-selecao";
import {
  ehNumerica,
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  formatar,
  type ColunaRelatorio,
} from "@/lib/relatorio-export";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { FileSpreadsheet, FileText, Inbox, Loader2, TriangleAlert } from "lucide-react";

const MAX_MESES = 12;

/** `2026-07` → `Julho/2026`. */
function rotuloMes(mes: string) {
  const [ano, m] = mes.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomes[Number(m) - 1]}/${ano}`;
}

/** Média só dos meses com movimento (valor ≠ 0) — mês parado não puxa a média para baixo. */
function mediaComMovimento(l: LinhaPivot): number {
  const comMovimento = [...l.porMes.values()].filter((m) => m.valor !== 0);
  return comMovimento.length ? l.totalValor / comMovimento.length : 0;
}

/** Uma linha por cliente (e por vendedor, quando a quebra está ligada) — a base do grid e da exportação. */
interface LinhaPivot {
  chave: string;
  tipo: "dado" | "cabecalho" | "subtotal" | "total";
  vendedorId: string | null;
  vendedor: string | null;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNome: string | null;
  porMes: Map<string, { quantidade: number; valor: number }>;
  totalQuantidade: number;
  totalValor: number;
}

/** Soma um conjunto de linhas, mês a mês — usada pelos subtotais e pelo total geral. */
function somar(linhas: LinhaPivot[], meses: string[]): Pick<LinhaPivot, "porMes" | "totalQuantidade" | "totalValor"> {
  const porMes = new Map(meses.map((m) => [m, { quantidade: 0, valor: 0 }]));
  let totalQuantidade = 0;
  let totalValor = 0;
  for (const l of linhas) {
    for (const [mes, v] of l.porMes) {
      const atual = porMes.get(mes);
      if (atual) {
        atual.quantidade += v.quantidade;
        atual.valor += v.valor;
      }
    }
    totalQuantidade += l.totalQuantidade;
    totalValor += l.totalValor;
  }
  return { porMes, totalQuantidade, totalValor };
}

const SEM_VALORES = (meses: string[]) => new Map(meses.map((m) => [m, { quantidade: 0, valor: 0 }]));

/**
 * Agrupado: o vendedor não é coluna — vira uma linha de cabeçalho (só o
 * nome) antes do grupo e repete no subtotal do fim, sem repetir em cada
 * linha de cliente. Sem agrupar: lista plana, sem cabeçalho nem subtotal —
 * a coluna Vendedor (fora daqui, em `colunas`) é quem identifica a linha.
 * Nos dois casos, o total geral fecha a grade.
 */
function comSubtotais(linhas: LinhaPivot[], meses: string[], quebraPorVendedor: boolean): LinhaPivot[] {
  if (!linhas.length) return linhas;
  const resultado: LinhaPivot[] = [];
  if (quebraPorVendedor) {
    let vendedorAtual: string | null | undefined;
    let grupo: LinhaPivot[] = [];
    const fecharGrupo = () => {
      if (!grupo.length) return;
      resultado.push({
        chave: `subtotal::${vendedorAtual}`,
        tipo: "subtotal",
        vendedorId: vendedorAtual ?? null,
        vendedor: grupo[0].vendedor,
        clienteId: null,
        clienteCodigo: grupo[0].vendedor,
        clienteNome: "Subtotal",
        ...somar(grupo, meses),
      });
    };
    for (const l of linhas) {
      if (l.vendedorId !== vendedorAtual) {
        fecharGrupo();
        vendedorAtual = l.vendedorId;
        grupo = [];
        resultado.push({
          chave: `cabecalho::${vendedorAtual}`,
          tipo: "cabecalho",
          vendedorId: vendedorAtual ?? null,
          vendedor: l.vendedor,
          clienteId: null,
          clienteCodigo: l.vendedor,
          clienteNome: null,
          porMes: SEM_VALORES(meses),
          totalQuantidade: 0,
          totalValor: 0,
        });
      }
      resultado.push(l);
      grupo.push(l);
    }
    fecharGrupo();
  } else {
    resultado.push(...linhas);
  }
  resultado.push({
    chave: "total-geral",
    tipo: "total",
    vendedorId: null,
    vendedor: null,
    clienteId: null,
    clienteCodigo: null,
    clienteNome: "Total geral",
    ...somar(linhas, meses),
  });
  return resultado;
}

/**
 * Granularidade vendedor+cliente sempre — "Agrupar por vendedor" só liga ou
 * desliga o subtotal/agrupamento visual (`comSubtotais`), não mistura mais
 * vendedores diferentes numa linha só: sem isso a coluna Vendedor perdia o
 * sentido quando a quebra estava desligada.
 */
function pivotar(data: RelatorioVendasPorVendedorResultado): LinhaPivot[] {
  return data.linhas.map((l): LinhaPivot => ({
    chave: `${l.vendedorId ?? ""}::${l.clienteId}`,
    tipo: "dado",
    vendedorId: l.vendedorId,
    vendedor: l.vendedor,
    clienteId: l.clienteId,
    clienteCodigo: l.clienteCodigo,
    clienteNome: l.clienteNome,
    porMes: new Map(l.meses.map((m) => [m.mes, { quantidade: m.quantidade, valor: m.valor }])),
    totalQuantidade: l.totalQuantidade,
    totalValor: l.totalValor,
  }));
}

/**
 * Vendas por vendedor, mensal: cliente nas linhas, um bloco Qtd/Valor por mês
 * (até 12 meses), quebra por vendedor conforme o switch da tela (padrão vem
 * do parâmetro `RELATORIO_VENDAS_QUEBRA_VENDEDOR` da empresa).
 */
export function VendasPorVendedorGrid() {
  const [fim, setFim] = useState(hojeIso);
  const [inicio, setInicio] = useState(() => mesesAntesIso(hojeIso(), 5));
  const [vendedorIds, setVendedorIds] = useState<string[]>([]);
  const [clientes, setClientes] = useState<RelatorioOpcao[]>([]);
  const [produtos, setProdutos] = useState<RelatorioOpcao[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [agruparPorVendedor, setAgruparPorVendedor] = useState(true);
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);
  const [filtrosGerados, setFiltrosGerados] = useState<[string, string | undefined][]>([]);
  const { data: vendedores } = useVendedoresEscopo();
  const nomeCategoria = useNomeCategoria();
  const empresaAtiva = useAuthStore((s) => s.user?.empresas.find((e) => e.empresaId === s.user?.empresaAtivaId));
  const podeExportar = useAuthStore((s) => s.hasPermission("relatorio-vendas", "exportar"));

  const nomeVendedor = (id: string) => {
    const v = vendedores?.data.find((x) => x.id === id);
    return v ? v.nomeReduzido || v.nome : id;
  };

  const ativos: FiltroAtivo[] = [
    {
      rotulo: "Vendedor",
      valores: vendedorIds.map((id) => ({ id, texto: nomeVendedor(id) })),
      remover: (id) => setVendedorIds((v) => v.filter((x) => x !== id)),
    },
    {
      rotulo: "Cliente",
      valores: clientes.map((o) => ({ id: o.id, texto: rotuloOpcao(o) })),
      remover: (id) => setClientes((v) => v.filter((o) => o.id !== id)),
    },
    {
      rotulo: "Produto",
      valores: produtos.map((o) => ({ id: o.id, texto: rotuloOpcao(o) })),
      remover: (id) => setProdutos((v) => v.filter((o) => o.id !== id)),
    },
    {
      rotulo: "Categoria",
      valores: categoriaIds.map((id) => ({ id, texto: nomeCategoria(id) })),
      remover: (id) => setCategoriaIds((v) => v.filter((c) => c !== id)),
    },
  ];

  const mesesNoIntervalo = (() => {
    const [ai, mi] = inicio.split("-").map(Number);
    const [af, mf] = fim.split("-").map(Number);
    return (af - ai) * 12 + (mf - mi) + 1;
  })();
  const periodoValido = mesesNoIntervalo >= 1 && mesesNoIntervalo <= MAX_MESES;

  const gerar = () => {
    if (!periodoValido) return;
    setConsulta(
      semVazios({
        inicio,
        fim,
        vendedorIds: vendedorIds.join(","),
        clienteIds: idsDe(clientes),
        produtoIds: idsDe(produtos),
        categoriaIds: categoriaIds.join(","),
        quebraPorVendedor: String(agruparPorVendedor),
      }),
    );
    setFiltrosGerados(filtrosEmTexto(ativos));
  };

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["relatorios", "vendas-por-vendedor", consulta],
    queryFn: () =>
      apiFetch<RelatorioVendasPorVendedorResultado>("/relatorios/vendas-por-vendedor", { query: consulta ?? {} }),
    enabled: consulta !== null,
  });

  const linhas = useMemo(() => (data ? pivotar(data) : []), [data]);
  const ordenadas = useMemo(
    () =>
      [...linhas].sort((a, b) => {
        const v = (a.vendedor ?? "").localeCompare(b.vendedor ?? "", "pt-BR");
        return v !== 0 ? v : (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "", "pt-BR");
      }),
    [linhas],
  );
  // Subtotal por vendedor (quando agrupado) + total geral ao fim — linhas,
  // não só o resumo acima da grade.
  const comTotais = useMemo(
    () => comSubtotais(ordenadas, data?.meses ?? [], !!data?.quebraPorVendedor),
    [ordenadas, data?.meses, data?.quebraPorVendedor],
  );

  const colunas: ColunaRelatorio<LinhaPivot>[] = useMemo(() => {
    // Agrupado: o vendedor vai pela linha de cabeçalho/subtotal, não por
    // coluna — repetiria em toda linha de cliente à toa. Sem agrupar, a
    // coluna é a única forma de saber de quem é cada linha.
    const base: ColunaRelatorio<LinhaPivot>[] = data?.quebraPorVendedor
      ? []
      : [{ campo: "vendedor", titulo: "Vendedor", valor: (l) => l.vendedor }];
    base.push(
      { campo: "clienteCodigo", titulo: "Cód. Cliente", valor: (l) => l.clienteCodigo },
      { campo: "clienteNome", titulo: "Cliente", valor: (l) => l.clienteNome },
    );
    for (const mes of data?.meses ?? []) {
      base.push({
        campo: mes,
        titulo: rotuloMes(mes),
        // Linha de cabeçalho (só o nome do vendedor) fica em branco, não "R$ 0,00".
        valor: (l) => (l.tipo === "cabecalho" ? null : l.porMes.get(mes)?.valor ?? 0),
        formato: "moeda",
      });
    }
    base.push(
      { campo: "totalValor", titulo: "Total", valor: (l) => (l.tipo === "cabecalho" ? null : l.totalValor), formato: "moeda" },
      // Média só dos meses com movimento — mês parado não puxa a média para baixo.
      { campo: "mediaValor", titulo: "Média", valor: (l) => (l.tipo === "cabecalho" ? null : mediaComMovimento(l)), formato: "moeda" },
    );
    return base;
  }, [data?.quebraPorVendedor, data?.meses]);

  const filtrosTexto = consulta
    ? descreverFiltros({ inicio: String(consulta.inicio), fim: String(consulta.fim), rotulo: "Emissão" }, filtrosGerados)
    : [];

  const exportar = async (formato: "pdf" | "xlsx") => {
    const params = {
      titulo: "Vendas por vendedor (mensal)",
      empresaNome: empresaAtiva?.nomeFantasia,
      logoUrl: empresaAtiva?.logoUrl,
      filtros: filtrosTexto,
      colunas,
      // Com os subtotais por vendedor e o total geral — o arquivo sai igual à tela.
      linhas: comTotais,
    };
    if (formato === "pdf") await exportarRelatorioPdf(params);
    else await exportarRelatorioExcel(params);
  };

  return (
    <div className="space-y-2">
      <PainelFiltros
        ativos={ativos}
        onGerar={gerar}
        principais={
          <>
            <CampoData id="vv-inicio" rotulo="De" valor={inicio} onChange={setInicio} />
            <CampoData id="vv-fim" rotulo="Até" valor={fim} onChange={setFim} />
            <div className="w-56">
              <CampoFiltro rotulo="Vendedor">
                <VendedoresMultiSelect value={vendedorIds} onChange={setVendedorIds} />
              </CampoFiltro>
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <Switch id="vv-agrupar" checked={agruparPorVendedor} onCheckedChange={setAgruparPorVendedor} />
              <Label htmlFor="vv-agrupar">Agrupar por vendedor</Label>
            </div>
          </>
        }
      >
        <CampoFiltro rotulo="Cliente">
          <BuscaMultiSelect
            tipo="clientes"
            value={clientes}
            onChange={setClientes}
            buscaPlaceholder="Código, razão social, fantasia ou CNPJ..."
          />
        </CampoFiltro>
        <CampoFiltro rotulo="Produto">
          <BuscaMultiSelect
            tipo="produtos"
            value={produtos}
            onChange={setProdutos}
            buscaPlaceholder="Código, descrição, Cod. Corp., Cód. fabricante ou EAN..."
          />
        </CampoFiltro>
        <CampoCategorias valor={categoriaIds} onChange={setCategoriaIds} />
      </PainelFiltros>

      {!periodoValido && (
        <p className="text-sm text-destructive">
          O período não pode passar de {MAX_MESES} meses (hoje tem {mesesNoIntervalo}).
        </p>
      )}

      {consulta === null ? (
        <p className="text-sm text-muted-foreground">
          Escolha o período (até {MAX_MESES} meses) e os filtros e clique em <strong>Gerar</strong>.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {data ? `${ordenadas.length.toLocaleString("pt-BR")} linhas` : "Carregando..."}
                {isFetching && !isLoading && <Loader2 className="ml-2 inline size-3 animate-spin" />}
              </span>
              {data && (
                <>
                  <span>
                    <span className="text-muted-foreground">Quantidade: </span>
                    <strong>{formatar(data.totalQuantidade, "quantidade")}</strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Valor: </span>
                    <strong>{formatar(data.totalValor, "moeda")}</strong>
                  </span>
                </>
              )}
            </div>
            {podeExportar && (
              <>
                <Button variant="outline" className="gap-1.5" disabled={!ordenadas.length} onClick={() => void exportar("pdf")}>
                  <FileText className="size-4" />
                  PDF
                </Button>
                <Button variant="outline" className="gap-1.5" disabled={!ordenadas.length} onClick={() => void exportar("xlsx")}>
                  <FileSpreadsheet className="size-4" />
                  Excel
                </Button>
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {colunas.map((c) => (
                      <TableHead key={c.campo} className={ehNumerica(c.formato) ? "text-right whitespace-nowrap" : undefined}>
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.titulo}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {colunas.map((c) => (
                          <TableCell key={c.campo} className={ehNumerica(c.formato) ? "text-right whitespace-nowrap" : undefined}>
                            <Skeleton className="h-4 w-full max-w-36" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!isLoading && comTotais.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={colunas.length} className="h-40 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          {error ? (
                            <>
                              <TriangleAlert className="size-6 text-amber-500" />
                              Não foi possível carregar os registros.
                            </>
                          ) : (
                            <>
                              <Inbox className="size-6" />
                              Nada encontrado para o período e os filtros.
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading &&
                    comTotais.map((l) => (
                      <TableRow
                        key={l.chave}
                        className={cn(
                          "hover:bg-transparent",
                          l.tipo === "cabecalho" && "font-semibold border-t-2",
                          l.tipo === "subtotal" && "bg-muted/50 font-medium",
                          l.tipo === "total" && "bg-muted font-semibold border-t-2",
                        )}
                      >
                        {colunas.map((c) => (
                          <TableCell key={c.campo} className={ehNumerica(c.formato) ? "text-right whitespace-nowrap" : undefined}>
                            {formatar(c.valor(l), c.formato)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
