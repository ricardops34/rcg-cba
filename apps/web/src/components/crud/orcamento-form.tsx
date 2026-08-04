"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  orcamentoCreateSchema,
  orcamentoUpdateSchema,
  type CondicaoPagamento,
  type Oportunidade,
  type Orcamento,
  type OrcamentoCreate,
  type OrcamentoUpdate,
  type Produto,
  type StatusOrcamento,
  type Vendedor,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
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
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const LIST_ROUTE = "/crm/orcamentos";

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function OrcamentoForm({ orcamento }: { orcamento?: Orcamento }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<OrcamentoCreate, OrcamentoUpdate>("orcamentos");
  const [tabelaPorLinha, setTabelaPorLinha] = useState<(number | null)[]>(
    orcamento ? orcamento.itens.map((i) => i.vlrTabela) : [],
  );

  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[]; restrito: boolean; ehVendedorPuro: boolean }>(
        "/clientes/vendedores-escopo",
      ),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

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

  const adicionarItem = () => {
    linhas.append({ produtoId: "", quantidade: 1, vlrUnitario: 0 });
    setTabelaPorLinha((arr) => [...arr, null]);
  };
  const removerItem = (index: number) => {
    linhas.remove(index);
    setTabelaPorLinha((arr) => arr.filter((_, i) => i !== index));
  };

  const onSelecionarProduto = async (index: number, produto: Produto | null) => {
    if (!produto) return;
    form.setValue(`itens.${index}.produtoId`, produto.id);
    if (!clienteId) return;
    try {
      const resp = await apiFetch<{ vlrTabela: number | null; ultimoPreco: number | null }>(
        "/orcamentos/preco-produto",
        { query: { clienteId, produtoId: produto.id } },
      );
      form.setValue(`itens.${index}.vlrUnitario`, resp.vlrTabela ?? resp.ultimoPreco ?? 0);
      setTabelaPorLinha((arr) => arr.map((v, i) => (i === index ? resp.vlrTabela : v)));
    } catch {
      // Sem preço disponível — fica com o que já estava, o vendedor ajusta na mão.
    }
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
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar orçamento");
    }
  };

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
                    defaultValue={dateToInput(form.getValues("dataValidade"))}
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

                <div className="space-y-1.5">
                  {linhas.fields.map((linha, index) => (
                    <div key={linha.id} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <ProdutoCombobox
                          value={form.watch(`itens.${index}.produtoId`) || null}
                          onChange={(produto) => onSelecionarProduto(index, produto)}
                        />
                        {tabelaPorLinha[index] != null && (
                          <p className="px-1 text-xs text-muted-foreground">
                            Tabela: {moeda(tabelaPorLinha[index] as number)}
                          </p>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min={0.01}
                        className="w-24"
                        placeholder="Qtd"
                        {...form.register(`itens.${index}.quantidade`, { valueAsNumber: true })}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-32"
                        placeholder="Preço unit."
                        {...form.register(`itens.${index}.vlrUnitario`, { valueAsNumber: true })}
                      />
                      <div className="flex h-9 w-28 shrink-0 items-center justify-end text-sm font-medium">
                        {moeda((itensAtuais[index]?.quantidade || 0) * (itensAtuais[index]?.vlrUnitario || 0))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => removerItem(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {linhas.fields.length > 0 && (
                  <div className="flex justify-end border-t border-border/70 pt-2 text-sm font-medium">
                    Total: {moeda(totalCalculado)}
                  </div>
                )}
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {orcamento ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
