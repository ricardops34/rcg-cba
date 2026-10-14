"use client";

import { useState } from "react";
import type { RelatorioComprasLinha, RelatorioResultado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RelatorioPaginado } from "@/components/relatorios/relatorio-paginado";
import {
  CampoData,
  CampoTexto,
  descreverFiltros,
  hojeIso,
  inicioDoAnoIso,
  semVazios,
} from "@/components/relatorios/filtros";
import type { ColunaRelatorio } from "@/lib/relatorio-export";
import { PackagePlus } from "lucide-react";

const COLUNAS: ColunaRelatorio<RelatorioComprasLinha>[] = [
  { titulo: "Documento", valor: (l) => l.documento },
  { titulo: "Produto", valor: (l) => l.produtoCodigo },
  { titulo: "Descrição", valor: (l) => l.descricao },
  { titulo: "Quantidade", valor: (l) => l.quantidade, formato: "quantidade" },
  { titulo: "UM", valor: (l) => l.unidade },
  { titulo: "Vlr. Unitário", valor: (l) => l.vlrUnitario, formato: "moeda" },
  { titulo: "Alíq. IPI", valor: (l) => l.aliqIpi, formato: "percentual" },
  { titulo: "Vlr. Total", valor: (l) => l.vlrTotal, formato: "moeda" },
  { titulo: "Alíq. ICMS", valor: (l) => l.aliqIcms, formato: "percentual" },
  { titulo: "Cód. For/Cli", valor: (l) => l.codigoForCli },
  { titulo: "Razão Social", valor: (l) => l.razaoSocial },
  { titulo: "Dt. Digitação", valor: (l) => l.dtDigitacao, formato: "data" },
];

/**
 * Relatório de Compras: itens das notas de entrada no período da data de
 * digitação. As alíquotas vêm do ERP (D1_IPI, D1_PICM) — vazias até a
 * integração mandar.
 */
export default function RelatorioComprasPage() {
  const [inicio, setInicio] = useState(inicioDoAnoIso);
  const [fim, setFim] = useState(hojeIso);
  const [documento, setDocumento] = useState("");
  const [produto, setProduto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);

  const gerar = () => setConsulta(semVazios({ inicio, fim, documento, produto, fornecedor }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <PackagePlus className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Relatório de Compras</h1>
          <p className="text-xs text-muted-foreground">
            Itens das notas de entrada no período da data de digitação — compras e devoluções de
            cliente.
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
            <CampoData id="c-inicio" rotulo="De" valor={inicio} onChange={setInicio} />
            <CampoData id="c-fim" rotulo="Até" valor={fim} onChange={setFim} />
            <CampoTexto id="c-doc" rotulo="Documento" valor={documento} onChange={setDocumento} largura="w-36" />
            <CampoTexto id="c-prod" rotulo="Produto" valor={produto} onChange={setProduto} placeholder="Código ou descrição" />
            <CampoTexto id="c-forn" rotulo="Fornecedor/Cliente" valor={fornecedor} onChange={setFornecedor} placeholder="Código ou razão social" />
            <Button type="submit">Gerar</Button>
          </form>
        </CardContent>
      </Card>

      <RelatorioPaginado
        titulo="Relatório de Compras"
        rotina="relatorio-compras"
        chave="compras"
        consulta={consulta}
        filtrosTexto={
          consulta
            ? descreverFiltros({ inicio: String(consulta.inicio), fim: String(consulta.fim) }, [
                ["Documento", consulta.documento as string | undefined],
                ["Produto", consulta.produto as string | undefined],
                ["Fornecedor/Cliente", consulta.fornecedor as string | undefined],
              ])
            : []
        }
        buscar={(page, pageSize) =>
          apiFetch<RelatorioResultado<RelatorioComprasLinha>>("/relatorios/compras", {
            query: { ...consulta, page, pageSize },
          })
        }
        colunas={COLUNAS}
        rowKey={(l) => l.id}
        totais={(r) =>
          COLUNAS.map((c, i) =>
            i === 0
              ? "Total"
              : c.titulo === "Quantidade"
                ? (r.totais.quantidade ?? null)
                : c.titulo === "Vlr. Total"
                  ? (r.totais.vlrTotal ?? null)
                  : null,
          )
        }
      />
    </div>
  );
}
