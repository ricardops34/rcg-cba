"use client";

import { useState } from "react";
import type { RelatorioResultado, RelatorioVendasLinha } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { VendedoresMultiSelect } from "@/components/crud/vendedores-multi-select";
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
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { Receipt } from "lucide-react";

const COLUNAS: ColunaRelatorio<RelatorioVendasLinha>[] = [
  { titulo: "Vendedor", valor: (l) => l.vendedor },
  { titulo: "Cód. Cliente", valor: (l) => l.clienteCodigo },
  { titulo: "Nome Cliente", valor: (l) => l.clienteNome },
  { titulo: "Município", valor: (l) => l.municipio },
  { titulo: "Emissão", valor: (l) => l.emissao, formato: "data" },
  { titulo: "Nota Fiscal", valor: (l) => l.notaFiscal },
  { titulo: "Cód. Prod.", valor: (l) => l.produtoCodigo },
  { titulo: "Produto", valor: (l) => l.produto },
  { titulo: "Quantidade", valor: (l) => l.quantidade, formato: "quantidade" },
  { titulo: "Vlr. Produto", valor: (l) => l.vlrProduto, formato: "moeda" },
  { titulo: "Vlr. Item", valor: (l) => l.vlrItem, formato: "moeda" },
];

/**
 * Vendas por vendedor: itens de venda no período de emissão, pelo mesmo
 * critério das Consultas e do Dashboard — os números batem entre as telas.
 */
export default function RelatorioVendasPage() {
  const [inicio, setInicio] = useState(inicioDoAnoIso);
  const [fim, setFim] = useState(hojeIso);
  const [vendedorIds, setVendedorIds] = useState<string[]>([]);
  const [cliente, setCliente] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [produtoCodigo, setProdutoCodigo] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);
  const { data: vendedores } = useVendedoresEscopo();

  const gerar = () =>
    setConsulta(
      semVazios({
        inicio,
        fim,
        vendedorIds: vendedorIds.join(","),
        cliente,
        municipio,
        notaFiscal,
        produtoCodigo,
        produtoNome,
      }),
    );

  const nomesVendedores = (ids: string | undefined) =>
    ids
      ?.split(",")
      .map((id) => {
        const v = vendedores?.data.find((x) => x.id === id);
        return v ? v.nomeReduzido || v.nome : id;
      })
      .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <Receipt className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Vendas por vendedor</h1>
          <p className="text-xs text-muted-foreground">
            Itens vendidos no período de emissão, pelo mesmo critério das Consultas e do Dashboard
            (sem comodato e devolução).
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
            <CampoData id="v-inicio" rotulo="De" valor={inicio} onChange={setInicio} />
            <CampoData id="v-fim" rotulo="Até" valor={fim} onChange={setFim} />
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <VendedoresMultiSelect value={vendedorIds} onChange={setVendedorIds} />
            </div>
            <CampoTexto id="v-cli" rotulo="Cliente" valor={cliente} onChange={setCliente} placeholder="Código ou nome" />
            <CampoTexto id="v-mun" rotulo="Cidade" valor={municipio} onChange={setMunicipio} largura="w-40" />
            <CampoTexto id="v-nf" rotulo="NF" valor={notaFiscal} onChange={setNotaFiscal} largura="w-32" />
            <CampoTexto id="v-pcod" rotulo="Código produto" valor={produtoCodigo} onChange={setProdutoCodigo} largura="w-36" />
            <CampoTexto id="v-pnome" rotulo="Nome produto" valor={produtoNome} onChange={setProdutoNome} />
            <Button type="submit">Gerar</Button>
          </form>
        </CardContent>
      </Card>

      <RelatorioPaginado
        titulo="Vendas por vendedor"
        rotina="relatorio-vendas"
        chave="vendas"
        consulta={consulta}
        filtrosTexto={
          consulta
            ? descreverFiltros(
                { inicio: String(consulta.inicio), fim: String(consulta.fim), rotulo: "Emissão" },
                [
                  ["Vendedor", nomesVendedores(consulta.vendedorIds as string | undefined)],
                  ["Cliente", consulta.cliente as string | undefined],
                  ["Cidade", consulta.municipio as string | undefined],
                  ["NF", consulta.notaFiscal as string | undefined],
                  ["Código produto", consulta.produtoCodigo as string | undefined],
                  ["Nome produto", consulta.produtoNome as string | undefined],
                ],
              )
            : []
        }
        buscar={(page, pageSize) =>
          apiFetch<RelatorioResultado<RelatorioVendasLinha>>("/relatorios/vendas", {
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
                : c.titulo === "Vlr. Item"
                  ? (r.totais.vlrItem ?? null)
                  : null,
          )
        }
      />
    </div>
  );
}
