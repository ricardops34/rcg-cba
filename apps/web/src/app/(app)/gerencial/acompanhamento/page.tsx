"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type {
  AcompanhamentoAba,
  AcompanhamentoLinha,
  AcompanhamentoResposta,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Formato = "int" | "pct" | "min" | "horas" | "dec" | "moeda";

interface Coluna {
  campo: string;
  titulo: string;
  formato: Formato;
  /** Explicação curta, no tooltip do título. */
  ajuda?: string;
  /** Valor alto é ruim (vermelho quando maior que zero). */
  ruim?: boolean;
}

interface DefinicaoAba {
  id: AcompanhamentoAba;
  titulo: string;
  /** Sem seletor de janela: o assunto tem janela própria, dita na resposta. */
  janelaFixa?: boolean;
  colunas: Coluna[];
  /** Colunas do detalhe (lista de contatos, clientes…). */
  detalhe?: { titulo: string; colunas: { campo: string; titulo: string; formato?: "data" | "hora" | "sim" | "int" }[] };
}

const ABAS: DefinicaoAba[] = [
  {
    id: "atendimento",
    titulo: "Atendimento WhatsApp",
    colunas: [
      { campo: "conversas", titulo: "Conversas", formato: "int", ajuda: "Conversas com mensagem do cliente na janela" },
      { campo: "recebidas", titulo: "Recebidas", formato: "int" },
      { campo: "enviadas", titulo: "Enviadas", formato: "int", ajuda: "Mensagens de uma pessoa (sem a IA)" },
      { campo: "mediaMin", titulo: "1ª resposta (média)", formato: "min", ajuda: "Da primeira mensagem do cliente até a primeira resposta de uma pessoa" },
      { campo: "pctRapidas", titulo: "% em até 15 min", formato: "pct" },
      { campo: "semResposta", titulo: "Sem resposta", formato: "int", ruim: true, ajuda: "Cliente escreveu há mais de 1 h e ninguém respondeu" },
    ],
  },
  {
    id: "nao-vinculados",
    titulo: "Não vinculados",
    colunas: [
      { campo: "conversas", titulo: "Conversas", formato: "int", ruim: true },
      { campo: "recebidas", titulo: "Recebidas", formato: "int" },
      { campo: "enviadas", titulo: "Enviadas", formato: "int" },
    ],
    detalhe: {
      titulo: "Contatos sem cliente vinculado (mais movimentados)",
      colunas: [
        { campo: "contato", titulo: "Contato" },
        { campo: "telefone", titulo: "Telefone" },
        { campo: "vendedor", titulo: "Atendido por" },
        { campo: "mensagens", titulo: "Mensagens", formato: "int" },
        { campo: "ultimaMensagem", titulo: "Última mensagem", formato: "hora" },
      ],
    },
  },
  {
    id: "carteira",
    titulo: "Cobertura de carteira",
    colunas: [
      { campo: "clientes", titulo: "Clientes ativos", formato: "int" },
      { campo: "comprou", titulo: "Compraram", formato: "int" },
      { campo: "contatados", titulo: "Contatados", formato: "int" },
      { campo: "cobertos", titulo: "Cobertos", formato: "int", ajuda: "Compraram ou foram contatados" },
      { campo: "pctCobertura", titulo: "% cobertura", formato: "pct" },
      { campo: "semMovimento", titulo: "Sem movimento", formato: "int", ruim: true, ajuda: "Nem compraram nem foram contatados na janela" },
      { campo: "nuncaCompraram", titulo: "Nunca compraram", formato: "int" },
    ],
  },
  {
    id: "cadastro",
    titulo: "Atualização cadastral",
    janelaFixa: true,
    colunas: [
      { campo: "clientes", titulo: "Clientes ativos", formato: "int" },
      { campo: "comEmail", titulo: "Com e-mail", formato: "int" },
      { campo: "comTelefone", titulo: "Com telefone", formato: "int" },
      { campo: "comContato", titulo: "Com contato", formato: "int" },
      { campo: "completos", titulo: "Completos", formato: "int", ajuda: "E-mail, telefone e ao menos um contato" },
      { campo: "pctCompletos", titulo: "% completos", formato: "pct" },
      { campo: "receitaRecente", titulo: "Receita recente", formato: "int", ajuda: "Consultados na Receita no período" },
      { campo: "atualizadosMao", titulo: "Alterados à mão", formato: "int", ajuda: "Por uma pessoa, não pela integração" },
    ],
  },
  {
    id: "mix",
    titulo: "Mix",
    colunas: [
      { campo: "clientes", titulo: "Clientes que compraram", formato: "int" },
      { campo: "mixAnterior", titulo: "Mix anterior", formato: "dec", ajuda: "Produtos distintos por cliente na janela anterior" },
      { campo: "mixAtual", titulo: "Mix atual", formato: "dec", ajuda: "Produtos distintos por cliente na janela" },
      { campo: "variacao", titulo: "Variação", formato: "dec" },
      { campo: "subiram", titulo: "Mix subiu", formato: "int" },
      { campo: "cairam", titulo: "Mix caiu", formato: "int", ruim: true },
    ],
  },
  {
    id: "descontos",
    titulo: "Descontos",
    colunas: [
      { campo: "orcamentos", titulo: "Orçamentos", formato: "int" },
      { campo: "itens", titulo: "Itens", formato: "int" },
      { campo: "pctItensComDesconto", titulo: "% itens com desconto", formato: "pct" },
      { campo: "descontoMedio", titulo: "Desconto médio", formato: "pct", ajuda: "Ponderado pelo valor do item" },
      { campo: "descontoMaximo", titulo: "Desconto máximo", formato: "pct" },
      { campo: "pedidos", titulo: "Pedidos de liberação", formato: "int" },
      { campo: "autorizados", titulo: "Autorizados", formato: "int" },
      { campo: "recusados", titulo: "Recusados", formato: "int" },
    ],
  },
  {
    id: "orcamentos",
    titulo: "Orçamentos",
    colunas: [
      { campo: "total", titulo: "Criados", formato: "int" },
      { campo: "finalizados", titulo: "Finalizados", formato: "int", ajuda: "Aprovados, recusados ou vencidos" },
      { campo: "abertos", titulo: "Não finalizados", formato: "int", ruim: true, ajuda: "Rascunho ou enviado, sem resposta" },
      { campo: "aprovado", titulo: "Aprovados", formato: "int" },
      { campo: "recusado", titulo: "Recusados", formato: "int" },
      { campo: "expirado", titulo: "Vencidos", formato: "int" },
      { campo: "pctConversao", titulo: "% aprovação", formato: "pct", ajuda: "Aprovados ÷ (enviados + finalizados)" },
      { campo: "valorAprovado", titulo: "Valor aprovado", formato: "moeda" },
      { campo: "valorAberto", titulo: "Valor em aberto", formato: "moeda" },
      { campo: "horasDecisao", titulo: "Envio → decisão do cliente", formato: "horas", ajuda: "Do primeiro envio até a resposta do cliente (link ou portal)" },
      { campo: "horasDecisaoVendedor", titulo: "Envio → decisão (vendedor)", formato: "horas", ajuda: "Quando o próprio vendedor registrou a decisão" },
      { campo: "nasceramWhatsapp", titulo: "Nasceram no WhatsApp", formato: "int" },
      { campo: "enviadosWhatsapp", titulo: "Enviados pelo WhatsApp", formato: "int" },
    ],
  },
  {
    id: "comodato",
    titulo: "Comodato",
    janelaFixa: true,
    colunas: [
      { campo: "comComodato", titulo: "Clientes com comodato", formato: "int" },
      { campo: "semCompra", titulo: "Sem compra", formato: "int", ruim: true, ajuda: "Nenhuma nota de venda na janela" },
      { campo: "semAplicaveis", titulo: "Sem compra de aplicáveis", formato: "int", ruim: true, ajuda: "Não comprou produto aplicável aos equipamentos que tem" },
    ],
    detalhe: {
      titulo: "Clientes com comodato sem compra (até 100)",
      colunas: [
        { campo: "cliente", titulo: "Cliente" },
        { campo: "vendedor", titulo: "Vendedor" },
        { campo: "ultimaCompra", titulo: "Última compra", formato: "data" },
        { campo: "semCompra", titulo: "Sem compra", formato: "sim" },
        { campo: "semAplicaveis", titulo: "Sem aplicáveis", formato: "sim" },
      ],
    },
  },
];

const JANELAS = [7, 15, 30, 60, 90, 180, 365];

function formatar(valor: unknown, formato: Formato): string {
  if (valor === null || valor === undefined) return "—";
  const n = Number(valor);
  if (Number.isNaN(n)) return String(valor);
  switch (formato) {
    case "int":
      return n.toLocaleString("pt-BR");
    case "pct":
      return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "dec":
      return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "moeda":
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "min":
      if (n < 60) return `${Math.round(n)} min`;
      if (n < 60 * 48) return `${(n / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
      return `${(n / 1440).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
    case "horas":
      if (n < 48) return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
      return `${(n / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
  }
}

function formatarDetalhe(valor: unknown, formato?: "data" | "hora" | "sim" | "int"): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (formato) {
    case "sim":
      return Number(valor) ? "Sim" : "—";
    case "int":
      return Number(valor).toLocaleString("pt-BR");
    case "data":
      return new Date(String(valor) + (String(valor).length <= 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR");
    case "hora":
      return new Date(String(valor)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    default:
      return String(valor);
  }
}

/**
 * Acompanhamento da equipe: o gestor vê, por vendedor, tempos de atendimento,
 * cobertura de carteira, cadastro, mix, descontos, orçamentos e comodato.
 * O alcance (quem aparece) vem da hierarquia do cadastro de Vendedores, no
 * servidor — ver docs/planos/2026-10-27-acompanhamento-equipe.md.
 */
export default function AcompanhamentoPage() {
  const [aba, setAba] = useState<AcompanhamentoAba>("atendimento");
  const [dias, setDias] = useState(30);
  const def = ABAS.find((a) => a.id === aba)!;

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["acompanhamento", aba, def.janelaFixa ? 0 : dias],
    queryFn: () =>
      apiFetch<AcompanhamentoResposta>(`/acompanhamento/${aba}`, {
        query: def.janelaFixa ? {} : { dias },
      }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Acompanhamento da equipe</h1>
          <p className="text-sm text-muted-foreground">
            Uma linha por vendedor, dentro do alcance da sua hierarquia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!def.janelaFixa && (
            <label className="flex items-center gap-2 text-sm">
              Últimos
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              >
                {JANELAS.map((j) => (
                  <option key={j} value={j}>
                    {j} dias
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as AcompanhamentoAba)}>
        <div className="overflow-x-auto">
          <TabsList>
            {ABAS.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.titulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Não foi possível carregar este acompanhamento."}
        </p>
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  {def.colunas.map((c) => (
                    <TableHead key={c.campo} className="text-right" title={c.ajuda}>
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={def.colunas.length + 1} className="py-8 text-center text-muted-foreground">
                      Nenhum vendedor no seu alcance.
                    </TableCell>
                  </TableRow>
                )}
                {data.linhas.map((l: AcompanhamentoLinha) => (
                  <TableRow key={l.vendedorId ?? l.vendedor}>
                    <TableCell className="font-medium">{l.vendedor}</TableCell>
                    {def.colunas.map((c) => (
                      <TableCell
                        key={c.campo}
                        className={cn("text-right tabular-nums", c.ruim && Number(l[c.campo]) > 0 && "text-destructive")}
                      >
                        {formatar(l[c.campo], c.formato)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {data.linhas.length > 0 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    {def.colunas.map((c) => (
                      <TableCell key={c.campo} className="text-right tabular-nums">
                        {formatar(data.total[c.campo], c.formato)}
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            {def.janelaFixa ? `Janela fixa de ${data.periodoDias} dias. ` : `Últimos ${data.periodoDias} dias. `}
            {data.nota}
          </p>

          {def.detalhe && data.detalhe && data.detalhe.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">{def.detalhe.titulo}</h2>
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {def.detalhe.colunas.map((c) => (
                        <TableHead key={c.campo}>{c.titulo}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.detalhe.map((d, i) => (
                      <TableRow key={i}>
                        {def.detalhe!.colunas.map((c) => (
                          <TableCell key={c.campo}>{formatarDetalhe(d[c.campo], c.formato)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
