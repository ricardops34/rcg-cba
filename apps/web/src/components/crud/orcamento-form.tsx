"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  orcamentoCreateSchema,
  orcamentoUpdateSchema,
  type CondicaoPagamento,
  type Oportunidade,
  type Orcamento,
  type OrcamentoConfig,
  type OrcamentoCreate,
  type OrcamentoUpdate,
  type PosicaoClienteMix,
  type Produto,
  type StatusOrcamento,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { STATUS_ORCAMENTO } from "@/components/crud/orcamento-status";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusDot } from "@/components/crud/status-dot";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const LIST_ROUTE = "/crm/orcamentos";

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));
const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Info local (não vai pro submit) de cada linha de item, pra render das colunas Descrição/Preço tabela. */
interface LinhaInfo {
  codigoErp: string;
  descricao: string;
  unidade: string | null;
  vlrTabela: number | null;
}

/**
 * Corpo do formulário de orçamento (cartão + campos) — usado tanto na página
 * cheia (`OrcamentoForm`) quanto na cortina lateral (`OrcamentoSheet`, aberta
 * a partir da listagem de Posição de Cliente).
 */
export function OrcamentoFormContent({
  orcamento,
  clienteIdPadrao,
  onClose,
}: {
  orcamento?: Orcamento;
  /** Pré-seleciona o cliente ao criar (ex.: "Incluir Orçamento" na Posição de Cliente). */
  clienteIdPadrao?: string | null;
  /** Chamado ao cancelar ou depois de salvar com sucesso. */
  onClose: () => void;
}) {
  const { create, update } = useResourceMutations<OrcamentoCreate, OrcamentoUpdate>("orcamentos");
  const [infoPorLinha, setInfoPorLinha] = useState<(LinhaInfo | null)[]>(
    orcamento
      ? orcamento.itens.map((i) => ({
          codigoErp: i.produto.codigoErp,
          descricao: i.produto.descricao,
          unidade: i.produto.unidade,
          vlrTabela: i.vlrTabela,
        }))
      : [],
  );

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const orcamentoConfigQuery = useQuery({
    queryKey: ["orcamento-config"],
    queryFn: () => apiFetch<OrcamentoConfig>("/orcamento-config"),
  });

  const condicoesQuery = useQuery({
    queryKey: ["condicoes-pagamento", "select"],
    queryFn: () =>
      apiFetch<{ data: CondicaoPagamento[] }>("/condicoes-pagamento", {
        query: { pageSize: 100, ativo: true },
      }),
  });
  const opcoesCondicao = condicoesQuery.data?.data ?? [];

  const schema = orcamento ? orcamentoUpdateSchema : orcamentoCreateSchema;
  const empty: OrcamentoCreate = {
    clienteId: "",
    vendedorId: "",
    oportunidadeId: null,
    condicaoPagamentoId: null,
    titulo: "",
    status: "rascunho",
    dataValidade: null,
    dataRetorno: null,
    observacao: "",
    ativo: true,
    itens: [],
  };
  const form = useForm<OrcamentoCreate>({
    resolver: zodResolver(schema as typeof orcamentoCreateSchema),
    defaultValues: orcamento
      ? {
          clienteId: orcamento.clienteId,
          vendedorId: orcamento.vendedorId,
          oportunidadeId: orcamento.oportunidadeId,
          condicaoPagamentoId: orcamento.condicaoPagamentoId,
          titulo: orcamento.titulo,
          status: orcamento.status,
          dataValidade: orcamento.dataValidade ? new Date(orcamento.dataValidade) : null,
          dataRetorno: orcamento.dataRetorno ? new Date(orcamento.dataRetorno) : null,
          observacao: orcamento.observacao ?? "",
          ativo: orcamento.ativo,
          itens: orcamento.itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            vlrUnitario: i.vlrUnitario,
          })),
        }
      : empty,
  });

  const linhas = useFieldArray({ control: form.control, name: "itens" });
  const clienteId = form.watch("clienteId");
  const vendedorId = form.watch("vendedorId");
  const status = form.watch("status");

  // Ao criar (não editar), pré-seleciona o próprio vendedor do usuário
  // logado, se houver vínculo — só na primeira carga.
  const [vendedorPadraoAplicado, setVendedorPadraoAplicado] = useState(false);
  const meuVendedorId = vendedoresEscopoQuery.data?.meuVendedorId;
  useEffect(() => {
    if (!orcamento && !vendedorPadraoAplicado && meuVendedorId) {
      form.setValue("vendedorId", meuVendedorId);
      setVendedorPadraoAplicado(true);
    }
  }, [orcamento, vendedorPadraoAplicado, meuVendedorId, form]);

  // Ao criar vindo de "Incluir Orçamento" (Posição de Cliente ou ?clienteId=
  // na URL), pré-seleciona o cliente informado — só na primeira carga.
  const [clientePadraoAplicado, setClientePadraoAplicado] = useState(false);
  useEffect(() => {
    if (!orcamento && !clientePadraoAplicado && clienteIdPadrao) {
      form.setValue("clienteId", clienteIdPadrao);
      setClientePadraoAplicado(true);
    }
  }, [orcamento, clientePadraoAplicado, clienteIdPadrao, form]);

  // Ao criar, sugere "Válido até" = hoje + diasValidade do parâmetro de
  // sistema (admin/orcamento-config) — só na primeira carga, o vendedor pode
  // ajustar a data livremente depois.
  const [validadePadraoAplicada, setValidadePadraoAplicada] = useState(false);
  const diasValidade = orcamentoConfigQuery.data?.diasValidade;
  useEffect(() => {
    if (!orcamento && !validadePadraoAplicada && diasValidade != null) {
      const data = new Date();
      data.setDate(data.getDate() + diasValidade);
      form.setValue("dataValidade", data);
      setValidadePadraoAplicada(true);
    }
  }, [orcamento, validadePadraoAplicada, diasValidade, form]);

  const itensAtuais = form.watch("itens");
  const totalCalculado = itensAtuais.reduce(
    (acc, it) => acc + (it.quantidade || 0) * (it.vlrUnitario || 0),
    0,
  );

  // Oportunidades do vendedor escolhido — só as ativas, mesmo critério do form de Atividade.
  const oportunidadesQuery = useQuery({
    queryKey: ["oportunidades", "select", vendedorId],
    queryFn: () =>
      apiFetch<{ data: Oportunidade[] }>("/oportunidades", {
        query: { vendedorId, pageSize: 100, ativo: true },
      }),
    enabled: !!vendedorId,
  });
  const opcoesOportunidade = oportunidadesQuery.data?.data ?? [];

  // Mix de produtos já comprados pelo cliente — alimenta a aba "Mix" (adicionar
  // ao orçamento) e a coluna "Última venda" da aba Itens.
  const mixQuery = useQuery({
    queryKey: ["clientes", clienteId, "mix"],
    queryFn: () => apiFetch<PosicaoClienteMix[]>(`/clientes/${clienteId}/mix`),
    enabled: !!clienteId,
  });
  const mix = mixQuery.data ?? [];
  const mixPorProduto = new Map(mix.map((m) => [m.produtoId, m]));

  const adicionarItem = () => {
    linhas.append({ produtoId: "", quantidade: 1, vlrUnitario: 0 });
    setInfoPorLinha((arr) => [...arr, null]);
  };
  const removerItem = (index: number) => {
    linhas.remove(index);
    setInfoPorLinha((arr) => arr.filter((_, i) => i !== index));
  };

  const onSelecionarProduto = async (index: number, produto: Produto | null) => {
    if (!produto) return;
    form.setValue(`itens.${index}.produtoId`, produto.id);
    setInfoPorLinha((arr) =>
      arr.map((v, i) =>
        i === index
          ? { codigoErp: produto.codigoErp, descricao: produto.descricao, unidade: produto.unidade ?? null, vlrTabela: v?.vlrTabela ?? null }
          : v,
      ),
    );
    if (!clienteId) return;
    try {
      const resp = await apiFetch<{ vlrTabela: number | null; ultimoPreco: number | null }>(
        "/orcamentos/preco-produto",
        { query: { clienteId, produtoId: produto.id } },
      );
      form.setValue(`itens.${index}.vlrUnitario`, resp.vlrTabela ?? resp.ultimoPreco ?? 0);
      setInfoPorLinha((arr) =>
        arr.map((v, i) =>
          i === index
            ? { codigoErp: produto.codigoErp, descricao: produto.descricao, unidade: produto.unidade ?? null, vlrTabela: resp.vlrTabela }
            : v,
        ),
      );
    } catch {
      // Sem preço disponível — fica com o que já estava, o vendedor ajusta na mão.
    }
  };

  /**
   * Adiciona um item a partir da aba Mix, respeitando os valores/% da última
   * venda: reaplica o desconto praticado na última compra (ultimoDesconto)
   * sobre o preço de tabela vigente hoje, em vez de reusar o preço antigo
   * como está — se não houver tabela vigente ou desconto anterior, cai no
   * último preço praticado.
   */
  const adicionarDoMix = (produto: PosicaoClienteMix) => {
    if (itensAtuais.some((it) => it.produtoId === produto.produtoId)) {
      toast.info("Produto já está nos itens do orçamento");
      return;
    }
    const vlrUnitario =
      produto.precoTabela != null && produto.ultimoDesconto != null
        ? Math.round(produto.precoTabela * (1 - produto.ultimoDesconto / 100) * 100) / 100
        : (produto.ultimoPrecoUnitario ?? produto.precoTabela ?? 0);
    linhas.append({ produtoId: produto.produtoId, quantidade: 1, vlrUnitario });
    setInfoPorLinha((arr) => [
      ...arr,
      {
        codigoErp: produto.codigoErp,
        descricao: produto.descricao,
        unidade: produto.unidade,
        vlrTabela: produto.precoTabela,
      },
    ]);
    toast.success("Item adicionado ao orçamento");
  };

  const onSubmit = async (values: OrcamentoCreate) => {
    try {
      if (orcamento) {
        await update.mutateAsync({ id: orcamento.id, input: values });
        toast.success("Orçamento atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Orçamento cadastrado");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar orçamento");
    }
  };

  return (
    <Card>
      <form id="orcamento-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.titulo}>
              <FieldLabel htmlFor="titulo">Título</FieldLabel>
              <Input id="titulo" {...form.register("titulo")} />
              <FieldError errors={[form.formState.errors.titulo]} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.clienteId}>
                <FieldLabel htmlFor="clienteId">Cliente</FieldLabel>
                <ClienteCombobox
                  value={form.watch("clienteId") || null}
                  onChange={(id) => form.setValue("clienteId", id ?? "")}
                />
                <FieldError errors={[form.formState.errors.clienteId]} />
              </Field>
              <Field data-invalid={!!form.formState.errors.vendedorId}>
                <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
                <Select
                  value={vendedorId || undefined}
                  onValueChange={(v) => {
                    form.setValue("vendedorId", v);
                    form.setValue("oportunidadeId", null);
                  }}
                >
                  <SelectTrigger id="vendedorId" className="w-full">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesVendedor.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nomeReduzido || v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[form.formState.errors.vendedorId]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="oportunidadeId">Oportunidade</FieldLabel>
                <Select
                  value={form.watch("oportunidadeId") ?? "none"}
                  onValueChange={(v) => form.setValue("oportunidadeId", v === "none" ? null : v)}
                  disabled={!vendedorId}
                >
                  <SelectTrigger id="oportunidadeId" className="w-full">
                    <SelectValue
                      placeholder={vendedorId ? "Sem oportunidade" : "Escolha um vendedor primeiro"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem oportunidade</SelectItem>
                    {opcoesOportunidade.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="condicaoPagamentoId">Condição de pagamento</FieldLabel>
                <Select
                  value={form.watch("condicaoPagamentoId") ?? "none"}
                  onValueChange={(v) =>
                    form.setValue("condicaoPagamentoId", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger id="condicaoPagamentoId" className="w-full">
                    <SelectValue placeholder="Sem condição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem condição</SelectItem>
                    {opcoesCondicao.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(v) => form.setValue("status", v as StatusOrcamento)}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORCAMENTO.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="dataValidade">Válido até</FieldLabel>
                <Input
                  id="dataValidade"
                  type="date"
                  value={dateToInput(form.watch("dataValidade"))}
                  onChange={(e) => form.setValue("dataValidade", inputToDate(e.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dataRetorno">Data de retorno</FieldLabel>
                <Input
                  id="dataRetorno"
                  type="date"
                  defaultValue={dateToInput(form.getValues("dataRetorno"))}
                  onChange={(e) => form.setValue("dataRetorno", inputToDate(e.target.value))}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="observacao">Observação</FieldLabel>
              <Textarea id="observacao" rows={3} {...form.register("observacao")} />
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch("ativo")}
                onCheckedChange={(v) => form.setValue("ativo", v === true)}
              />
              Orçamento ativo
            </label>

            <div className="space-y-2 border-t border-border/70 pt-3">
              <Tabs defaultValue="itens">
                <TabsList>
                  <TabsTrigger value="itens">Itens ({linhas.fields.length})</TabsTrigger>
                  <TabsTrigger value="mix">Mix de produtos ({mix.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="itens" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FieldLabel>Itens</FieldLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!clienteId}
                      onClick={adicionarItem}
                    >
                      <Plus className="size-3.5" />
                      Adicionar item
                    </Button>
                  </div>

                  {!clienteId && (
                    <p className="text-sm text-muted-foreground">Selecione um cliente primeiro.</p>
                  )}
                  {clienteId && linhas.fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
                  )}

                  {linhas.fields.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Quantidade</TableHead>
                          <TableHead className="text-right">Preço</TableHead>
                          <TableHead className="text-right">Desconto</TableHead>
                          <TableHead>Última venda</TableHead>
                          <TableHead className="text-right">Preço tabela</TableHead>
                          <TableHead className="w-9" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.fields.map((linha, index) => {
                          const info = infoPorLinha[index];
                          const produtoId = itensAtuais[index]?.produtoId;
                          const vlrUnitario = itensAtuais[index]?.vlrUnitario || 0;
                          const vlrTabela = info?.vlrTabela ?? null;
                          const desconto =
                            vlrTabela != null && vlrTabela > 0
                              ? ((vlrTabela - vlrUnitario) / vlrTabela) * 100
                              : null;
                          const ultimaVenda = produtoId
                            ? (mixPorProduto.get(produtoId)?.ultimaCompra ?? null)
                            : null;
                          return (
                            <TableRow key={linha.id}>
                              <TableCell className="min-w-48">
                                <ProdutoCombobox
                                  value={produtoId || null}
                                  onChange={(produto) => onSelecionarProduto(index, produto)}
                                />
                              </TableCell>
                              <TableCell className="max-w-56 truncate text-muted-foreground">
                                {info?.descricao ?? "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0.01}
                                  className="w-20 text-right"
                                  {...form.register(`itens.${index}.quantidade`, {
                                    valueAsNumber: true,
                                  })}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="w-28 text-right"
                                  {...form.register(`itens.${index}.vlrUnitario`, {
                                    valueAsNumber: true,
                                  })}
                                />
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {percentual(desconto)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {dataBr(ultimaVenda)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {moeda(vlrTabela)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  onClick={() => removerItem(index)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {linhas.fields.length > 0 && (
                    <div className="flex justify-end border-t border-border/70 pt-2 text-sm font-medium">
                      Total: {moeda(totalCalculado)}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="mix" className="space-y-2">
                  {!clienteId && (
                    <p className="text-sm text-muted-foreground">Selecione um cliente primeiro.</p>
                  )}
                  {clienteId && mixQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">Carregando mix de produtos...</p>
                  )}
                  {clienteId && !mixQuery.isLoading && mix.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Cliente ainda não comprou nenhum produto.
                    </p>
                  )}
                  {mix.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Última compra</TableHead>
                          <TableHead className="text-right">Últ. preço</TableHead>
                          <TableHead className="text-right">Últ. desconto</TableHead>
                          <TableHead className="text-right">Preço tabela</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="w-28" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mix.map((m) => {
                          const jaAdicionado = itensAtuais.some((it) => it.produtoId === m.produtoId);
                          return (
                            <TableRow key={m.produtoId}>
                              <TableCell>{m.codigoErp}</TableCell>
                              <TableCell className="max-w-56 truncate">{m.descricao}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {dataBr(m.ultimaCompra)}
                              </TableCell>
                              <TableCell className="text-right">{moeda(m.ultimoPrecoUnitario)}</TableCell>
                              <TableCell className="text-right">{percentual(m.ultimoDesconto)}</TableCell>
                              <TableCell className="text-right">{moeda(m.precoTabela)}</TableCell>
                              <TableCell>
                                <StatusDot active={m.ativo} />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={jaAdicionado}
                                  onClick={() => adicionarDoMix(m)}
                                >
                                  <Plus className="size-3.5" />
                                  {jaAdicionado ? "Adicionado" : "Adicionar"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {orcamento ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** Página cheia de cadastro/edição de orçamento. */
export function OrcamentoForm({ orcamento }: { orcamento?: Orcamento }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdPadrao = searchParams.get("clienteId");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {orcamento ? "Editar orçamento" : "Novo orçamento"}
        </h1>
      </div>

      <OrcamentoFormContent
        orcamento={orcamento}
        clienteIdPadrao={clienteIdPadrao}
        onClose={() => router.push(LIST_ROUTE)}
      />
    </div>
  );
}

/**
 * Cortina lateral pra criar um orçamento já com o cliente pré-selecionado —
 * usada a partir da listagem de Posição de Cliente ("Incluir Orçamento"),
 * pra não perder busca/filtro/paginação de quem está consultando a lista.
 */
export function OrcamentoSheet({
  clienteId,
  onOpenChange,
}: {
  clienteId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const handleClose = () => {
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  return (
    <Sheet open={!!clienteId} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={720}>
        <SheetHeader>
          <SheetTitle>Novo orçamento</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {clienteId && (
            <OrcamentoFormContent key={clienteId} clienteIdPadrao={clienteId} onClose={handleClose} />
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
