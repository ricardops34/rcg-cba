"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  RelatorioEstoqueCompraLinha,
  RelatorioEstoqueCompraResultado,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { usePaginaLocal } from "@/components/comercial/posicao-cliente-ano";
import {
  CampoCategoria,
  CampoData,
  CampoTexto,
  dataBr,
  hojeIso,
  semVazios,
  useDescricaoCategoria,
} from "@/components/relatorios/filtros";
import {
  ehNumerica,
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  formatar,
  type ColunaRelatorio,
} from "@/lib/relatorio-export";
import { Boxes, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

/** `2026-10-13` menos 3 meses → `2026-07-13`, como o período da planilha. */
function mesesAntes(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1 - meses, d));
  return data.toISOString().slice(0, 10);
}

type Ordem = { coluna: keyof RelatorioEstoqueCompraLinha; sentido: "asc" | "desc" };

/**
 * Estoque e compra: estoque (armazéns de revenda), entradas e saídas do
 * período, média mensal de saída e quanto comprar para N meses
 * (média × meses − estoque; negativo = sobra).
 */
export default function RelatorioEstoqueCompraPage() {
  const empresaNome = useAuthStore(
    (s) => s.user?.empresas.find((e) => e.empresaId === s.user?.empresaAtivaId)?.nomeFantasia,
  );
  const [atalho, setAtalho] = useState("3");
  const [fim, setFim] = useState(hojeIso);
  const [inicio, setInicio] = useState(() => mesesAntes(hojeIso(), 3));
  const [mesesCompra, setMesesCompra] = useState("6");
  const [produto, setProduto] = useState("");
  const [codigoCorp, setCodigoCorp] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [comMovimento, setComMovimento] = useState(true);
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);
  const categoriaTexto = useDescricaoCategoria(consulta?.categoriaId as string | undefined);
  const [ordem, setOrdem] = useState<Ordem>({ coluna: "codigo", sentido: "asc" });
  // PDF e Excel só com a ação Exportar da rotina.
  const podeExportar = useAuthStore((s) => s.hasPermission("relatorio-estoque-compra", "exportar"));

  const escolherAtalho = (valor: string) => {
    setAtalho(valor);
    if (valor !== "datas") setInicio(mesesAntes(fim, Number(valor)));
  };

  const gerar = () =>
    setConsulta(
      semVazios({
        inicio,
        fim,
        mesesPeriodo: atalho === "datas" ? undefined : Number(atalho),
        mesesCompra,
        produto,
        codigoCorp,
        fornecedor,
        categoriaId,
        comMovimento: String(comMovimento),
      }),
    );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["relatorios", "estoque-compra", consulta],
    queryFn: () =>
      apiFetch<RelatorioEstoqueCompraResultado>("/relatorios/estoque-compra", { query: consulta ?? {} }),
    enabled: consulta !== null,
  });

  const colunas: ColunaRelatorio<RelatorioEstoqueCompraLinha>[] = useMemo(
    () => [
      { titulo: "Código", valor: (l) => l.codigo },
      { titulo: "Descrição", valor: (l) => l.descricao },
      { titulo: "Cod. Corp.", valor: (l) => l.codigoCorp },
      { titulo: "Fornecedor", valor: (l) => l.fornecedor },
      { titulo: "Estoque", valor: (l) => l.estoque, formato: "numero" },
      { titulo: "Entrada-Qtd", valor: (l) => l.entradas, formato: "numero" },
      { titulo: "Saída-Qtd", valor: (l) => l.saidas, formato: "numero" },
      { titulo: "Últ. Preço", valor: (l) => l.ultimoPreco, formato: "moeda" },
      { titulo: "Média", valor: (l) => l.media, formato: "numero" },
      { titulo: `Comprar (${data?.mesesCompra ?? mesesCompra} meses)`, valor: (l) => l.aComprar, formato: "numero" },
    ],
    [data?.mesesCompra, mesesCompra],
  );
  const chaves: (keyof RelatorioEstoqueCompraLinha)[] = [
    "codigo", "descricao", "codigoCorp", "fornecedor", "estoque", "entradas", "saidas", "ultimoPreco", "media", "aComprar",
  ];

  const ordenadas = useMemo(() => {
    const linhas = [...(data?.linhas ?? [])];
    const { coluna, sentido } = ordem;
    linhas.sort((a, b) => {
      const va = a[coluna];
      const vb = b[coluna];
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return sentido === "asc" ? r : -r;
    });
    return linhas;
  }, [data, ordem]);
  const { itens, paginacao } = usePaginaLocal(ordenadas);

  const filtrosTexto = consulta
    ? [
        `Movimento: ${dataBr(String(consulta.inicio))} a ${dataBr(String(consulta.fim))}` +
          (data ? ` (${data.mesesPeriodo.toLocaleString("pt-BR")} meses)` : ""),
        `Compra para ${String(consulta.mesesCompra)} meses · Estoque dos armazéns de revenda`,
        ...[
          ["Produto", consulta.produto],
          ["Cod. Corp.", consulta.codigoCorp],
          ["Fornecedor", consulta.fornecedor],
          ["Categoria", categoriaTexto],
        ]
          .filter(([, v]) => v)
          .map(([r, v]) => `${String(r)}: ${String(v)}`),
      ]
    : [];

  const exportar = (formato: "pdf" | "xlsx") => {
    const params = { titulo: "Estoque e compra", empresaNome, filtros: filtrosTexto, colunas, linhas: ordenadas };
    if (formato === "pdf") exportarRelatorioPdf(params);
    else exportarRelatorioExcel(params);
  };

  const colunasTabela: ColumnDef<RelatorioEstoqueCompraLinha>[] = colunas.map((c, i) => ({
    header: c.titulo,
    sortKey: chaves[i],
    className: ehNumerica(c.formato) ? "text-right whitespace-nowrap" : undefined,
    cell: (l) => formatar(c.valor(l), c.formato),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <Boxes className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Estoque e compra</h1>
          <p className="text-xs text-muted-foreground">
            Média mensal de saída no período e quanto comprar: média × meses de compra − estoque
            (negativo = sobra). Estoque dos armazéns de revenda; fornecedor da última compra.
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              gerar();
            }}
          >
            <div className="space-y-1">
              <Label>Período do movimento</Label>
              <Select value={atalho} onValueChange={escolherAtalho}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["3", "4", "5", "6"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} meses
                    </SelectItem>
                  ))}
                  <SelectItem value="datas">Escolher datas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CampoData
              id="e-inicio"
              rotulo="De"
              valor={inicio}
              onChange={(v) => {
                setInicio(v);
                setAtalho("datas");
              }}
            />
            <CampoData
              id="e-fim"
              rotulo="Até"
              valor={fim}
              onChange={(v) => {
                setFim(v);
                if (atalho !== "datas") setInicio(mesesAntes(v, Number(atalho)));
              }}
            />
            <div className="space-y-1">
              <Label htmlFor="e-meses">Comprar para (meses)</Label>
              <Input
                id="e-meses"
                type="number"
                min={1}
                max={24}
                className="w-28"
                value={mesesCompra}
                onChange={(e) => setMesesCompra(e.target.value)}
              />
            </div>
            <CampoTexto id="e-prod" rotulo="Nosso código e produto" valor={produto} onChange={setProduto} />
            <CampoTexto id="e-corp" rotulo="Cod. Corp." valor={codigoCorp} onChange={setCodigoCorp} largura="w-36" />
            <CampoCategoria valor={categoriaId} onChange={setCategoriaId} />
            <CampoTexto id="e-forn" rotulo="Fornecedor" valor={fornecedor} onChange={setFornecedor} />
            <div className="flex items-center gap-2 pb-2">
              <Switch id="e-mov" checked={comMovimento} onCheckedChange={setComMovimento} />
              <Label htmlFor="e-mov">Só com estoque ou movimento</Label>
            </div>
            <Button type="submit">Gerar</Button>
          </form>
        </CardContent>
      </Card>

      {consulta === null ? (
        <p className="text-sm text-muted-foreground">
          Escolha o período e os filtros e clique em <strong>Gerar</strong>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm text-muted-foreground">
              {data
                ? `${data.linhas.length.toLocaleString("pt-BR")} produtos · média sobre ${data.mesesPeriodo.toLocaleString("pt-BR")} meses`
                : "Carregando..."}
              {isFetching && !isLoading && <Loader2 className="ml-2 inline size-3 animate-spin" />}
            </p>
            {podeExportar && (
              <>
                <Button variant="outline" className="gap-1.5" disabled={!data?.linhas.length} onClick={() => exportar("pdf")}>
                  <FileText className="size-4" />
                  PDF
                </Button>
                <Button variant="outline" className="gap-1.5" disabled={!data?.linhas.length} onClick={() => exportar("xlsx")}>
                  <FileSpreadsheet className="size-4" />
                  Excel
                </Button>
              </>
            )}
          </div>
          <EntityTable
            columns={colunasTabela}
            rows={itens}
            rowKey={(l) => l.produtoId}
            isLoading={isLoading}
            error={error}
            {...paginacao}
            sortBy={ordem.coluna}
            sortOrder={ordem.sentido}
            onSortChange={(coluna, sentido) =>
              setOrdem({ coluna: coluna as keyof RelatorioEstoqueCompraLinha, sentido })
            }
            emptyMessage="Nenhum produto para o período e os filtros."
          />
        </div>
      )}
    </div>
  );
}
