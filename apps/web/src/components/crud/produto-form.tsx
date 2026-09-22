"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  produtoCreateSchema,
  produtoUpdateSchema,
  type Armazem,
  type Categoria,
  type Produto,
  type ProdutoCreate,
  type ProdutoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Lock } from "lucide-react";

const LIST_ROUTE = "/cadastros/produtos";

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const nanToNull = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : v);

export function ProdutoForm({ produto }: { produto?: Produto }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<ProdutoCreate, ProdutoUpdate>("produtos");

  /**
   * Produto com chave de integração é espelho do Protheus: o import casa por
   * `chave` e regrava os campos que o ERP manda, então editá-los aqui seria
   * trabalho perdido no próximo sync — a API recusa, e a tela nem oferece.
   * Sobra o que é só da plataforma (ver `CAMPOS_DO_ERP` no back).
   */
  const doErp = !!produto?.chave;

  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 100, raiz: true } }),
  });
  const subcategoriasQuery = useQuery({
    queryKey: ["categorias", "select", "subs"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", { query: { pageSize: 200, raiz: false } }),
  });
  const armazensQuery = useQuery({
    queryKey: ["armazens", "select"],
    queryFn: () => apiFetch<{ data: Armazem[] }>("/armazens", { query: { pageSize: 100 } }),
  });

  const categorias = categoriasQuery.data?.data ?? [];
  const armazens = armazensQuery.data?.data ?? [];

  const schema = produto ? produtoUpdateSchema : produtoCreateSchema;
  const empty: ProdutoCreate = {
    codigoErp: "",
    descricao: "",
    unidade: "",
    categoriaId: null,
    subCategoriaId: null,
    armazemId: null,
    marca: "",
    codigoBarras: "",
    codigoFornecedor: "",
    ncm: "",
    qtdEmbalagem: null,
    peso: null,
    ultimoPreco: null,
    observacao: "",
    exibirFotoOrcamento: false,
    ativo: true,
  };
  const form = useForm<ProdutoCreate>({
    resolver: zodResolver(schema as typeof produtoCreateSchema),
    defaultValues: produto
      ? {
          codigoErp: produto.codigoErp,
          descricao: produto.descricao,
          unidade: produto.unidade ?? "",
          categoriaId: produto.categoriaId ?? null,
          subCategoriaId: produto.subCategoriaId ?? null,
          armazemId: produto.armazemId ?? null,
          marca: produto.marca ?? "",
          codigoBarras: produto.codigoBarras ?? "",
          codigoFornecedor: produto.codigoFornecedor ?? "",
          ncm: produto.ncm ?? "",
          qtdEmbalagem: produto.qtdEmbalagem ?? null,
          peso: produto.peso ?? null,
          ultimoPreco: produto.ultimoPreco ?? null,
          observacao: produto.observacao ?? "",
          exibirFotoOrcamento: produto.exibirFotoOrcamento,
          ativo: produto.ativo,
        }
      : empty,
  });

  // Subcategoria acompanha a categoria escolhida; sem categoria, mostra todas.
  const categoriaAtual = form.watch("categoriaId");
  const subcategorias = (subcategoriasQuery.data?.data ?? []).filter(
    (s) => !categoriaAtual || s.categoriaPaiId === categoriaAtual,
  );

  const onSubmit = async (values: ProdutoCreate) => {
    const payload: ProdutoCreate = {
      ...values,
      qtdEmbalagem: nanToNull(values.qtdEmbalagem),
      peso: nanToNull(values.peso),
      ultimoPreco: nanToNull(values.ultimoPreco),
    };
    try {
      if (produto) {
        // No produto do ERP só um campo é nosso — mandar o resto faria a API
        // recusar o salvamento inteiro.
        await update.mutateAsync({
          id: produto.id,
          input: doErp ? { exibirFotoOrcamento: payload.exibirFotoOrcamento } : payload,
        });
        toast.success("Produto atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Produto cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar produto");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {produto ? "Editar produto" : "Novo produto"}
        </h1>
      </div>

      {doErp && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium">Este produto vem do ERP</p>
            <p className="text-muted-foreground">
              Chave de integração <code className="font-mono">{produto?.chave}</code>. Os campos do
              Protheus estão bloqueados porque o próximo import os regravaria — altere lá. Aqui
              continuam editáveis a foto, os campos complementares e as fichas técnicas, na tela de
              detalhe do produto.
            </p>
          </div>
        </div>
      )}

      <Card>
        <form id="produto-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field data-invalid={!!form.formState.errors.codigoErp}>
                  <FieldLabel htmlFor="codigoErp">Código</FieldLabel>
                  <Input id="codigoErp" maxLength={30} disabled={doErp} {...form.register("codigoErp")} />
                  <FieldError errors={[form.formState.errors.codigoErp]} />
                </Field>
                <Field
                  className="sm:col-span-3"
                  data-invalid={!!form.formState.errors.descricao}
                >
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" maxLength={120} disabled={doErp} {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="categoriaId">Categoria</FieldLabel>
                  <Select
                    value={form.watch("categoriaId") ?? "none"}
                    disabled={doErp}
                    onValueChange={(v) => {
                      form.setValue("categoriaId", v === "none" ? null : v);
                      form.setValue("subCategoriaId", null);
                    }}
                  >
                    <SelectTrigger id="categoriaId" className="w-full">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="subCategoriaId">Subcategoria</FieldLabel>
                  <Select
                    value={form.watch("subCategoriaId") ?? "none"}
                    disabled={doErp}
                    onValueChange={(v) => form.setValue("subCategoriaId", v === "none" ? null : v)}
                  >
                    <SelectTrigger id="subCategoriaId" className="w-full">
                      <SelectValue placeholder="Sem subcategoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem subcategoria</SelectItem>
                      {subcategorias.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="armazemId">Armazém</FieldLabel>
                  <Select
                    value={form.watch("armazemId") ?? "none"}
                    disabled={doErp}
                    onValueChange={(v) => form.setValue("armazemId", v === "none" ? null : v)}
                  >
                    <SelectTrigger id="armazemId" className="w-full">
                      <SelectValue placeholder="Sem armazém" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem armazém</SelectItem>
                      {armazens.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="unidade">Unidade</FieldLabel>
                  <Input id="unidade" maxLength={4} disabled={doErp} {...form.register("unidade")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="marca">Marca</FieldLabel>
                  <Input id="marca" maxLength={40} disabled={doErp} {...form.register("marca")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ncm">NCM</FieldLabel>
                  <Input id="ncm" maxLength={20} disabled={doErp} {...form.register("ncm")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="codigoBarras">Código de barras</FieldLabel>
                  <Input
                    id="codigoBarras"
                    maxLength={30}
                    disabled={doErp}
                    {...form.register("codigoBarras")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="codigoFornecedor">Código do fornecedor</FieldLabel>
                  <Input
                    id="codigoFornecedor"
                    maxLength={60}
                    disabled={doErp}
                    {...form.register("codigoFornecedor")}
                  />
                </Field>
                <Field data-invalid={!!form.formState.errors.qtdEmbalagem}>
                  <FieldLabel htmlFor="qtdEmbalagem">Qtd. por embalagem</FieldLabel>
                  <Input
                    id="qtdEmbalagem"
                    type="number"
                    step="any"
                    disabled={doErp}
                    {...form.register("qtdEmbalagem", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.qtdEmbalagem]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.peso}>
                  <FieldLabel htmlFor="peso">Peso</FieldLabel>
                  <Input
                    id="peso"
                    type="number"
                    step="any"
                    disabled={doErp}
                    {...form.register("peso", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.peso]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.ultimoPreco}>
                  <FieldLabel htmlFor="ultimoPreco">Último preço</FieldLabel>
                  <Input
                    id="ultimoPreco"
                    type="number"
                    step="any"
                    disabled={doErp}
                    {...form.register("ultimoPreco", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.ultimoPreco]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                <Textarea
                  id="observacao"
                  rows={3}
                  maxLength={500}
                  disabled={doErp}
                  {...form.register("observacao")}
                />
              </Field>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("ativo")}
                    disabled={doErp}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  Produto ativo
                </label>
                <Field className="gap-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.watch("exibirFotoOrcamento")}
                      onCheckedChange={(v) => form.setValue("exibirFotoOrcamento", v === true)}
                    />
                    Exibir foto no orçamento
                  </label>
                  {doErp && (
                    <FieldDescription>
                      Este é o único campo do cadastro que o ERP não manda — por isso continua
                      editável aqui.
                    </FieldDescription>
                  )}
                </Field>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {produto ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
