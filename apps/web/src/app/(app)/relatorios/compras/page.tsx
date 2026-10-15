"use client";

import { useState } from "react";
import type { RelatorioComprasLinha, RelatorioOpcao, RelatorioResultado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { RelatorioPaginado } from "@/components/relatorios/relatorio-paginado";
import {
  CampoCategorias,
  CampoData,
  CampoTexto,
  descreverFiltros,
  hojeIso,
  inicioDoAnoIso,
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
  { titulo: "Cód. Fornecedor", valor: (l) => l.codigoForCli },
  { titulo: "Razão Social", valor: (l) => l.razaoSocial },
  { titulo: "Dt. Digitação", valor: (l) => l.dtDigitacao, formato: "data" },
];

/**
 * Relatório de Compras: itens das notas de compra (NF de entrada tipo normal,
 * de mercadoria — sem CT-e, serviço e devolução) no período da digitação. As alíquotas vêm do ERP (D1_IPI, D1_PICM) — vazias até a
 * integração mandar.
 */
export default function RelatorioComprasPage() {
  const [inicio, setInicio] = useState(inicioDoAnoIso);
  const [fim, setFim] = useState(hojeIso);
  const [documento, setDocumento] = useState("");
  const [produtos, setProdutos] = useState<RelatorioOpcao[]>([]);
  const [fornecedores, setFornecedores] = useState<RelatorioOpcao[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);
  // Texto dos filtros do que foi gerado, para o PDF e o Excel.
  const [filtrosGerados, setFiltrosGerados] = useState<[string, string | undefined][]>([]);
  const nomeCategoria = useNomeCategoria();

  const ativos: FiltroAtivo[] = [
    {
      rotulo: "Documento",
      valores: documento.trim() ? [{ id: "doc", texto: documento.trim() }] : [],
      remover: () => setDocumento(""),
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
    {
      rotulo: "Fornecedor",
      valores: fornecedores.map((o) => ({ id: o.id, texto: rotuloOpcao(o) })),
      remover: (id) => setFornecedores((v) => v.filter((o) => o.id !== id)),
    },
  ];

  const gerar = () => {
    setConsulta(
      semVazios({
        inicio,
        fim,
        documento,
        produtoIds: idsDe(produtos),
        fornecedorIds: idsDe(fornecedores),
        categoriaIds: categoriaIds.join(","),
      }),
    );
    setFiltrosGerados(filtrosEmTexto(ativos));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <PackagePlus className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Relatório de Compras</h1>
          <p className="text-xs text-muted-foreground">
            Itens das notas de compra (NF de entrada tipo normal — sem CT-e, serviço e devolução) no
            período da data de digitação.
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <PainelFiltros
            ativos={ativos}
            onGerar={gerar}
            principais={
              <>
                <CampoData id="c-inicio" rotulo="De" valor={inicio} onChange={setInicio} />
                <CampoData id="c-fim" rotulo="Até" valor={fim} onChange={setFim} />
              </>
            }
          >
            <CampoFiltro rotulo="Produto">
              <BuscaMultiSelect
                tipo="produtos"
                value={produtos}
                onChange={setProdutos}
                buscaPlaceholder="Código, descrição, Cod. Corp., Fabric., Allia ou EAN..."
              />
            </CampoFiltro>
            <CampoFiltro rotulo="Fornecedor">
              <BuscaMultiSelect
                tipo="fornecedores"
                value={fornecedores}
                onChange={setFornecedores}
                buscaPlaceholder="Código, razão social, fantasia ou CNPJ..."
              />
            </CampoFiltro>
            <CampoCategorias valor={categoriaIds} onChange={setCategoriaIds} />
            <CampoTexto id="c-doc" rotulo="Documento" valor={documento} onChange={setDocumento} largura="w-full" placeholder="Número da nota" />
          </PainelFiltros>
        </CardContent>
      </Card>

      <RelatorioPaginado
        titulo="Relatório de Compras"
        rotina="relatorio-compras"
        chave="compras"
        consulta={consulta}
        filtrosTexto={
          consulta
            ? descreverFiltros({ inicio: String(consulta.inicio), fim: String(consulta.fim) }, filtrosGerados)
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
