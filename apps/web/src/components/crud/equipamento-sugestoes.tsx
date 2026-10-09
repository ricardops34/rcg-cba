"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lightbulb, Plus } from "lucide-react";
import type {
  EquipamentoAplicacaoLoteResultado,
  EquipamentoCategoriaOpcao,
  EquipamentoComuns,
  EquipamentoSugestao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RECURSO = "equipamentos-comodato";
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const MINIMOS = [100, 80, 50, 30];
const TODAS = "todas";

/**
 * Sugestões de produtos aplicáveis, em duas leituras das notas:
 *
 * - **Comuns aos clientes**: o que os clientes que estão com o equipamento
 *   compram, por subcategoria, a partir de uma cobertura mínima. É a pergunta
 *   "o que todo mundo que tem este dispenser compra?".
 * - **Acima da média**: o que eles compram mais do que os demais clientes.
 *
 * Nas duas, marca-se um ou mais itens e adiciona-se de uma vez. Nada é gravado
 * sem esse clique. O filtro de categoria vale para as duas e é aplicado na
 * API, antes dos cortes — filtrar aqui esconderia o que o corte deixou de fora.
 */
export function EquipamentoSugestoes({
  equipamentoId,
  podeEditar,
}: {
  equipamentoId: string;
  podeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const [aba, setAba] = useState("comuns");
  const [minimo, setMinimo] = useState(50);
  const [categoria, setCategoria] = useState(TODAS);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const categoriaId = categoria === TODAS ? undefined : categoria;

  const categorias = useQuery({
    queryKey: [RECURSO, "sugestoes", "categorias"],
    queryFn: () =>
      apiFetch<EquipamentoCategoriaOpcao[]>(`/${RECURSO}/sugestoes/categorias`),
  });

  const comuns = useQuery({
    queryKey: [RECURSO, equipamentoId, "comuns", minimo, categoriaId],
    queryFn: () =>
      apiFetch<EquipamentoComuns>(`/${RECURSO}/${equipamentoId}/comuns`, {
        query: { minimo, categoriaId },
      }),
    enabled: aba === "comuns",
  });

  const acima = useQuery({
    queryKey: [RECURSO, equipamentoId, "sugestoes", categoriaId],
    queryFn: () =>
      apiFetch<EquipamentoSugestao[]>(`/${RECURSO}/${equipamentoId}/sugestoes`, {
        query: { categoriaId },
      }),
    enabled: aba === "acima",
  });
  const nomeCategoria = categorias.data?.find((c) => c.id === categoriaId)?.descricao;

  // Ids que a aba aberta mostra: a seleção é da aba, e trocar de aba não pode
  // levar marcados que a pessoa não está vendo.
  const visiveis = useMemo(
    () =>
      aba === "comuns"
        ? (comuns.data?.grupos ?? []).flatMap((g) => g.produtos.map((p) => p.produto.id))
        : (acima.data ?? []).map((s) => s.produto.id),
    [aba, comuns.data, acima.data],
  );
  const marcados = visiveis.filter((id) => selecionados.has(id));

  const alternar = (ids: string[], marcar: boolean) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });

  const adicionar = useMutation({
    mutationFn: (produtoIds: string[]) =>
      apiFetch<EquipamentoAplicacaoLoteResultado>(
        `/${RECURSO}/${equipamentoId}/aplicacoes/lote`,
        { method: "POST", body: { produtoIds } },
      ),
    onSuccess: (r) => {
      if (r.adicionados > 0) toast.success(`${r.adicionados} produto(s) aplicável(is) adicionado(s)`);
      if (r.recusados.length > 0) {
        toast.warning(
          `${r.recusados.length} não entraram: ${r.recusados.map((x) => x.motivo).join(" · ")}`,
        );
      }
      setSelecionados(new Set());
      void queryClient.invalidateQueries({ queryKey: [RECURSO] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível adicionar"),
  });

  const marca = (ids: string[]) => {
    const todos = ids.length > 0 && ids.every((id) => selecionados.has(id));
    const alguns = ids.some((id) => selecionados.has(id));
    return { checked: todos ? true : alguns ? ("indeterminate" as const) : false, todos };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Lightbulb className="size-4 text-amber-500" />
          Sugestões pelas notas
          {podeEditar && (
            <Button
              size="sm"
              className="ml-auto"
              disabled={marcados.length === 0 || adicionar.isPending}
              onClick={() => adicionar.mutate(marcados)}
            >
              <Plus className="size-4" />
              Adicionar selecionados ({marcados.length})
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Categoria</span>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger size="sm" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as categorias</SelectItem>
              {(categorias.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.descricao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="comuns">Comuns aos clientes</TabsTrigger>
            <TabsTrigger value="acima">Acima da média</TabsTrigger>
          </TabsList>

          <TabsContent value="comuns" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Entre os clientes que <strong>estão com este equipamento</strong> e compraram nos
                últimos 24 meses
                {comuns.data ? ` (${comuns.data.totalClientes})` : ""}, o que é comprado por
              </span>
              <Select value={String(minimo)} onValueChange={(v) => setMinimo(Number(v))}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINIMOS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m === 100 ? "todos (100%)" : `${m}% ou mais`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>deles. Agrupado pela subcategoria do produto.</span>
            </div>

            {comuns.isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : !comuns.data || comuns.data.totalClientes === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente com este equipamento comprou nos últimos 24 meses.
              </p>
            ) : comuns.data.grupos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum grupo de produtos{nomeCategoria ? ` de ${nomeCategoria}` : ""} é
                comprado por {minimo === 100 ? "todos" : `${minimo}% ou mais`} desses{" "}
                {comuns.data.totalClientes} clientes. Experimente uma cobertura menor
                {nomeCategoria ? " ou outra categoria" : ""}.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {podeEditar && <TableHead className="w-10" />}
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Clientes que compram</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comuns.data.grupos.map((g) => {
                      const ids = g.produtos.map((p) => p.produto.id);
                      const m = marca(ids);
                      return (
                        <GrupoLinhas
                          key={g.subcategoria?.id ?? "sem"}
                          titulo={g.subcategoria?.descricao ?? "Sem subcategoria"}
                          clientes={g.clientes}
                          percentual={g.percentual}
                          podeEditar={podeEditar}
                          marcaGrupo={m.checked}
                          onMarcarGrupo={() => alternar(ids, !m.todos)}
                        >
                          {g.produtos.map((p) => (
                            <TableRow key={p.produto.id}>
                              {podeEditar && (
                                <TableCell>
                                  <Checkbox
                                    checked={selecionados.has(p.produto.id)}
                                    onCheckedChange={(v) => alternar([p.produto.id], v === true)}
                                    aria-label={`Selecionar ${p.produto.descricao}`}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="pl-6">
                                <span className="mr-2 font-mono text-xs text-muted-foreground">
                                  {p.produto.codigoErp}
                                </span>
                                {p.produto.descricao}
                              </TableCell>
                              <TableCell className="text-xs">{p.produto.categoria ?? "—"}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {p.clientes} ({pct(p.percentual)})
                              </TableCell>
                            </TableRow>
                          ))}
                        </GrupoLinhas>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="acima" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O que os clientes que receberam este equipamento compram acima da média dos demais
              clientes, nos últimos 24 meses. Descrição parecida com a do equipamento vem primeiro.
            </p>
            {acima.isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : !acima.data || acima.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {nomeCategoria
                  ? `Nada de ${nomeCategoria} se destaca nas compras dos clientes que receberam este equipamento.`
                  : "Sem sugestões: poucos clientes receberam este equipamento, ou nada se destaca nas compras deles."}
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {podeEditar && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={marca(visiveis).checked}
                            onCheckedChange={() => alternar(visiveis, !marca(visiveis).todos)}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                      )}
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Clientes c/ equipamento</TableHead>
                      <TableHead className="text-right">Entre todos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acima.data.map((s) => (
                      <TableRow key={s.produto.id}>
                        {podeEditar && (
                          <TableCell>
                            <Checkbox
                              checked={selecionados.has(s.produto.id)}
                              onCheckedChange={(v) => alternar([s.produto.id], v === true)}
                              aria-label={`Selecionar ${s.produto.descricao}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {s.produto.codigoErp}
                          </span>
                          {s.produto.descricao}
                          {s.descricaoParecida && (
                            <Badge
                              variant="outline"
                              className="ml-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
                            >
                              Descrição parecida
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{s.produto.categoria ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {s.clientesComEquipamento} ({pct(s.percentualComEquipamento)})
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pct(s.percentualGeral)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** Cabeçalho do grupo (subcategoria) com a caixa que marca o grupo inteiro. */
function GrupoLinhas({
  titulo,
  clientes,
  percentual,
  podeEditar,
  marcaGrupo,
  onMarcarGrupo,
  children,
}: {
  titulo: string;
  clientes: number;
  percentual: number;
  podeEditar: boolean;
  marcaGrupo: boolean | "indeterminate";
  onMarcarGrupo: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        {podeEditar && (
          <TableCell>
            <Checkbox
              checked={marcaGrupo}
              onCheckedChange={onMarcarGrupo}
              aria-label={`Selecionar todos de ${titulo}`}
            />
          </TableCell>
        )}
        <TableCell colSpan={2} className="font-medium">
          {titulo}
        </TableCell>
        <TableCell className="text-right font-medium">
          {clientes} ({pct(percentual)})
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
