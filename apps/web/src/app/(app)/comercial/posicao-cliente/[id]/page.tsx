"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoCliente } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/crud/status-dot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/posicao-cliente";

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

function Metrica({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Secao({
  titulo,
  vazio,
  children,
}: {
  titulo: string;
  vazio: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">{titulo}</p>
        {vazio ? (
          <p className="text-sm text-muted-foreground">Nenhum registro.</p>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

// Posição de Cliente: agrupa cliente + notas de saída + títulos a receber +
// mix de produtos comprados. Cada linha liga para o registro detalhado.
export default function PosicaoClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: posicao, isLoading, isError } = useQuery({
    queryKey: ["clientes", id, "posicao"],
    queryFn: () => apiFetch<PosicaoCliente>(`/clientes/${id}/posicao`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !posicao) {
    return <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>;
  }

  const { cliente, resumo, notas, titulos, mix } = posicao;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{cliente.razaoSocial}</h1>
        <StatusDot active={cliente.ativo} />
        {!cliente.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Código ERP" value={cliente.codigoErp || "—"} />
          <Info label="Nome fantasia" value={cliente.nomeFantasia || "—"} />
          <Info label="CNPJ/CPF" value={cliente.cnpjCpf || "—"} />
          <Info
            label="Vendedor"
            value={cliente.vendedor ? cliente.vendedor.nomeReduzido || cliente.vendedor.nome : "—"}
          />
          <Info
            label="Município/UF"
            value={[cliente.municipio, cliente.uf].filter(Boolean).join("/") || "—"}
          />
          <Info label="Contato" value={cliente.contato || "—"} />
          <Info label="Telefone" value={cliente.telefone || "—"} />
          <Info label="E-mail" value={cliente.email || "—"} />
          <Info label="Primeira compra" value={dataBr(cliente.primeiraCompra)} />
          <Info label="Última compra" value={dataBr(cliente.ultimaCompra)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metrica label="Notas fiscais" value={resumo.totalNotas.toLocaleString("pt-BR")} />
        <Metrica label="Total comprado" value={moeda(resumo.totalComprado)} />
        <Metrica label="Títulos em aberto" value={moeda(resumo.totalTitulosAberto)} />
        <Metrica label="Títulos vencidos" value={moeda(resumo.totalTitulosVencido)} />
      </div>

      <Secao titulo={`Notas fiscais de saída (${notas.length})`} vazio={notas.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nota</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Vlr. bruto</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notas.map((n) => (
              <TableRow
                key={n.id}
                className="cursor-pointer"
                onClick={() => router.push(`/comercial/notas-saida/${n.id}`)}
              >
                <TableCell className="font-mono font-medium">
                  {n.numero}
                  {n.serie && <span className="text-muted-foreground">/{n.serie}</span>}
                </TableCell>
                <TableCell>{dataBr(n.dtEmissao)}</TableCell>
                <TableCell className="text-xs">
                  {n.vendedor ? n.vendedor.nomeReduzido || n.vendedor.nome : "—"}
                </TableCell>
                <TableCell className="text-right">{moeda(n.vlrBruto)}</TableCell>
                <TableCell>
                  <StatusDot active={n.ativo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      <Secao titulo={`Títulos a receber (${titulos.length})`} vazio={titulos.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titulos.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer"
                onClick={() => router.push(`/comercial/titulos-receber/${t.id}`)}
              >
                <TableCell className="font-mono font-medium">
                  {t.prefixo && `${t.prefixo}-`}
                  {t.numero}
                  {t.parcela && `/${t.parcela}`}
                </TableCell>
                <TableCell>{dataBr(t.vencimento)}</TableCell>
                <TableCell className="text-right">{moeda(t.valor)}</TableCell>
                <TableCell className="text-right">{moeda(t.saldo)}</TableCell>
                <TableCell>
                  {t.dtBaixa ? (
                    <Badge variant="outline">Baixado {dataBr(t.dtBaixa)}</Badge>
                  ) : (
                    <Badge>Aberto</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      <Secao titulo={`Mix de produtos comprados (${mix.length})`} vazio={mix.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd. total</TableHead>
              <TableHead className="text-right">Vlr. total</TableHead>
              <TableHead className="text-right">Nº notas</TableHead>
              <TableHead>Última compra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mix.map((m) => (
              <TableRow
                key={m.produtoId}
                className="cursor-pointer"
                onClick={() => router.push(`/comercial/produtos/${m.produtoId}`)}
              >
                <TableCell className="font-mono text-xs">{m.codigoErp}</TableCell>
                <TableCell>
                  {m.descricao}
                  {m.unidade && <span className="text-xs text-muted-foreground"> ({m.unidade})</span>}
                </TableCell>
                <TableCell className="text-right">{m.quantidadeTotal.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">{moeda(m.vlrTotal)}</TableCell>
                <TableCell className="text-right">{m.qtdNotas}</TableCell>
                <TableCell>{dataBr(m.ultimaCompra)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>
    </div>
  );
}
