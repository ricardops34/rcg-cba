"use client";

import { useState } from "react";
import type { RelatorioOpcao, RelatorioResultado, RelatorioVendasLinha } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { VendedoresMultiSelect } from "@/components/crud/vendedores-multi-select";
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
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { Receipt } from "lucide-react";

const COLUNAS: ColunaRelatorio<RelatorioVendasLinha>[] = [
  { campo: "vendedor", titulo: "Vendedor", valor: (l) => l.vendedor },
  { campo: "clienteCodigo", titulo: "Cód. Cliente", valor: (l) => l.clienteCodigo },
  { campo: "clienteNome", titulo: "Nome Cliente", valor: (l) => l.clienteNome },
  { campo: "municipio", titulo: "Município", valor: (l) => l.municipio },
  { campo: "emissao", titulo: "Emissão", valor: (l) => l.emissao, formato: "data" },
  { campo: "notaFiscal", titulo: "Nota Fiscal", valor: (l) => l.notaFiscal },
  { campo: "produtoCodigo", titulo: "Cód. Prod.", valor: (l) => l.produtoCodigo },
  { campo: "produto", titulo: "Produto", valor: (l) => l.produto },
  { campo: "quantidade", titulo: "Quantidade", valor: (l) => l.quantidade, formato: "quantidade" },
  { campo: "vlrProduto", titulo: "Vlr. Produto", valor: (l) => l.vlrProduto, formato: "moeda" },
  { campo: "vlrItem", titulo: "Vlr. Item", valor: (l) => l.vlrItem, formato: "moeda" },
];

/**
 * Vendas por vendedor: itens de venda no período de emissão, pelo mesmo
 * critério das Consultas e do Dashboard — os números batem entre as telas.
 */
export default function RelatorioVendasPage() {
  const [inicio, setInicio] = useState(inicioDoAnoIso);
  const [fim, setFim] = useState(hojeIso);
  const [vendedorIds, setVendedorIds] = useState<string[]>([]);
  const [clientes, setClientes] = useState<RelatorioOpcao[]>([]);
  const [municipio, setMunicipio] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [produtos, setProdutos] = useState<RelatorioOpcao[]>([]);
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const [consulta, setConsulta] = useState<Record<string, string | number> | null>(null);
  // Texto dos filtros do que foi gerado, para o PDF e o Excel.
  const [filtrosGerados, setFiltrosGerados] = useState<[string, string | undefined][]>([]);
  const { data: vendedores } = useVendedoresEscopo();
  const nomeCategoria = useNomeCategoria();

  const nomeVendedor = (id: string) => {
    const v = vendedores?.data.find((x) => x.id === id);
    return v ? v.nomeReduzido || v.nome : id;
  };
  const texto = (rotulo: string, valor: string, limpar: () => void): FiltroAtivo => ({
    rotulo,
    valores: valor.trim() ? [{ id: rotulo, texto: valor.trim() }] : [],
    remover: limpar,
  });

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
    texto("Cidade", municipio, () => setMunicipio("")),
    texto("NF", notaFiscal, () => setNotaFiscal("")),
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

  const gerar = () => {
    setConsulta(
      semVazios({
        inicio,
        fim,
        vendedorIds: vendedorIds.join(","),
        clienteIds: idsDe(clientes),
        municipio,
        notaFiscal,
        produtoIds: idsDe(produtos),
        categoriaIds: categoriaIds.join(","),
      }),
    );
    setFiltrosGerados(filtrosEmTexto(ativos));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
          <Receipt className="size-4" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Vendas por vendedor</h1>
          <p className="text-xs text-muted-foreground">
            Itens vendidos no período de emissão, pelo mesmo critério das Consultas e do Dashboard
            (sem comodato e devolução).
          </p>
        </div>
      </div>

      <PainelFiltros
        ativos={ativos}
        onGerar={gerar}
        principais={
          <>
            <CampoData id="v-inicio" rotulo="De" valor={inicio} onChange={setInicio} />
            <CampoData id="v-fim" rotulo="Até" valor={fim} onChange={setFim} />
            <div className="w-56">
              <CampoFiltro rotulo="Vendedor">
                <VendedoresMultiSelect value={vendedorIds} onChange={setVendedorIds} />
              </CampoFiltro>
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
        <CampoTexto id="v-mun" rotulo="Cidade" valor={municipio} onChange={setMunicipio} largura="w-full" placeholder="Contém" />
        <CampoTexto id="v-nf" rotulo="NF" valor={notaFiscal} onChange={setNotaFiscal} largura="w-full" placeholder="Número da nota" />
      </PainelFiltros>

      <RelatorioPaginado
        titulo="Vendas por vendedor"
        rotina="relatorio-vendas"
        chave="vendas"
        consulta={consulta}
        filtrosTexto={
          consulta
            ? descreverFiltros(
                { inicio: String(consulta.inicio), fim: String(consulta.fim), rotulo: "Emissão" },
                filtrosGerados,
              )
            : []
        }
        buscar={(p) =>
          apiFetch<RelatorioResultado<RelatorioVendasLinha>>("/relatorios/vendas", {
            query: { ...consulta, ...p },
          })
        }
        colunas={COLUNAS}
        rowKey={(l) => l.id}
      />
    </div>
  );
}
