"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SugestaoCompraResultado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lightbulb, TriangleAlert, Users } from "lucide-react";

const moeda = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/**
 * Sugestão de compra: o que clientes parecidos compram e este não.
 *
 * A tela mostra a evidência junto da sugestão de propósito — sem saber *quem*
 * compra e *quanto*, a lista vira palpite e o vendedor não usa.
 */
export default function SugestaoCompraPage() {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [meses, setMeses] = useState("12");
  const [base, setBase] = useState("ambos");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sugestao-compra", clienteId, meses, base],
    queryFn: () =>
      apiFetch<SugestaoCompraResultado>(`/sugestao-compra/cliente/${clienteId}`, {
        query: { meses: Number(meses), baseSemelhanca: base },
      }),
    enabled: !!clienteId,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <Field className="w-full sm:w-96">
            <FieldLabel>Cliente</FieldLabel>
            <ClienteCombobox value={clienteId} onChange={setClienteId} />
          </Field>
          <Field className="w-full sm:w-40">
            <FieldLabel>Histórico</FieldLabel>
            <Select value={meses} onValueChange={setMeses}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="24">24 meses</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-full sm:w-56">
            <FieldLabel>Base da semelhança</FieldLabel>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">Cesta + ramo (CNAE)</SelectItem>
                <SelectItem value="cesta">Só cesta de compras</SelectItem>
                <SelectItem value="cnae">Só ramo (CNAE)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {!clienteId && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Escolha um cliente para ver o que clientes parecidos com ele compram
            e ele ainda não.
          </CardContent>
        </Card>
      )}

      {isLoading && clienteId && (
        <p className="text-sm text-muted-foreground">Calculando...</p>
      )}

      {isError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {(error as Error)?.message ?? "Erro ao gerar a sugestão"}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{data.razaoSocial}</span>
                <Badge variant="outline">
                  {data.produtosNaCesta} produto(s) na cesta
                </Badge>
                <Badge variant="outline">
                  <Users className="mr-1 size-3" />
                  {data.clientesSemelhantes.length} semelhantes
                </Badge>
              </div>
              {data.cnaes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.cnaes.map((c) => (
                    <Badge key={c} variant="secondary" className="font-normal">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {data.aviso && (
            <Card>
              <CardContent className="flex items-start gap-2 pt-6 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>{data.aviso}</span>
              </CardContent>
            </Card>
          )}

          {data.sugestoes.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="flex items-center gap-2 pb-3 text-sm font-medium">
                  <Lightbulb className="size-4" />
                  Produtos a oferecer
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Produto</th>
                        <th className="py-1.5 pr-3 font-medium">Quantos compram</th>
                        <th className="py-1.5 pr-3 font-medium">Ticket médio</th>
                        <th className="py-1.5 pr-3 font-medium">Preço p/ este cliente</th>
                        <th className="py-1.5 font-medium">Última compra no grupo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sugestoes.map((p) => (
                        <tr key={p.produtoId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="font-mono text-xs text-muted-foreground">
                              {p.codigoErp}
                            </div>
                            <div>{p.descricao}</div>
                          </td>
                          <td className="py-2 pr-3">
                            {/* A evidência é o argumento de venda — quem compra. */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted">
                                  {p.semelhantesQueCompram} de {p.totalSemelhantes}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {p.evidencia.length > 0
                                  ? p.evidencia.join(", ")
                                  : "Sem detalhe"}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="py-2 pr-3">{moeda(p.valorMedio)}</td>
                          <td className="py-2 pr-3">
                            {p.precoTabelaCliente == null ? (
                              <span className="text-muted-foreground">
                                sem preço na tabela
                              </span>
                            ) : (
                              moeda(p.precoTabelaCliente)
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {dataBr(p.ultimaCompraNoGrupo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {data.clientesSemelhantes.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="pb-1 text-sm font-medium">Clientes semelhantes</p>
                <p className="pb-3 text-xs text-muted-foreground">
                  Por que são parecidos: &quot;cesta&quot; é a fatia de produtos em
                  comum; &quot;ramo&quot; conta CNAEs compartilhados.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Cliente</th>
                        <th className="py-1.5 pr-3 font-medium">Semelhança</th>
                        <th className="py-1.5 pr-3 font-medium">Cesta</th>
                        <th className="py-1.5 pr-3 font-medium">Ramo</th>
                        <th className="py-1.5 font-medium">Região</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.clientesSemelhantes.map((s) => (
                        <tr key={s.clienteId} className="border-b last:border-0">
                          <td className="py-1.5 pr-3">
                            {s.razaoSocial}
                            {s.municipio && (
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                · {s.municipio}/{s.uf}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 font-medium">
                            {(s.score * 100).toFixed(0)}%
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {s.produtosEmComum} em comum ({(s.indiceCesta * 100).toFixed(0)}%)
                          </td>
                          <td className="py-1.5 pr-3">
                            {s.cnaesEmComum > 0 ? (
                              <span>
                                {s.cnaesEmComum} CNAE(s)
                                {s.mesmoCnaePrincipal && (
                                  <Badge variant="secondary" className="ml-1">
                                    mesmo ramo
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-1.5 text-muted-foreground">
                            {s.mesmaRegiao ? "mesma cidade" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
