"use client";

import { useState } from "react";
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
import {
  ArrowLeft,
  CircleDollarSign,
  Factory,
  Images,
  Package,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { regraDescontoLabel } from "@/lib/regra-desconto";
import { ProdutoCamposCard } from "@/components/comercial/produto-campos-card";
import { ProdutoFotosCard } from "@/components/crud/produto-fotos-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LIST_ROUTE = "/cadastros/produtos";

const emptyToNull = (v: unknown) =>
  v === "" || v === null || v === undefined ? null : Number(v);
const nanToNull = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? null : v;

export function ProdutoForm({
  produto,
  permitirEdicaoExtras = false,
}: {
  produto?: Produto;
  permitirEdicaoExtras?: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState("geral");
  const { create, update } = useResourceMutations<ProdutoCreate, ProdutoUpdate>("produtos");

  // Produto integrado é espelho do ERP: os campos do formulário ficam
  // visíveis para consulta, mas a edição ocorre no sistema de origem.
  const doErp = !!produto?.chave;

  const categoriasQuery = useQuery({
    queryKey: ["categorias", "select", "raizes"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: true },
      }),
  });
  const subcategoriasQuery = useQuery({
    queryKey: ["categorias", "select", "subs"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: false },
      }),
  });
  const armazensQuery = useQuery({
    queryKey: ["armazens", "select"],
    queryFn: () =>
      apiFetch<{ data: Armazem[] }>("/armazens", { query: { pageSize: 100 } }),
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
          ativo: produto.ativo,
        }
      : empty,
  });

  const categoriaAtual = form.watch("categoriaId");
  const subcategorias = (subcategoriasQuery.data?.data ?? []).filter(
    (subcategoria) =>
      !categoriaAtual || subcategoria.categoriaPaiId === categoriaAtual,
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
        await update.mutateAsync({ id: produto.id, input: doErp ? {} : payload });
        toast.success("Produto atualizado");
        router.push(LIST_ROUTE);
      } else {
        const criado = (await create.mutateAsync(payload)) as Produto;
        toast.success("Produto cadastrado");
        router.push(`${LIST_ROUTE}/${criado.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar produto");
    }
  };

  const onInvalid = () => {
    const errors = form.formState.errors;
    setAba(
      errors.qtdEmbalagem || errors.peso || errors.ultimoPreco
        ? "comercial"
        : "geral",
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {produto ? produto.descricao : "Novo produto"}
          </h1>
          {produto ? (
            <p className="font-mono text-xs text-muted-foreground">{produto.codigoErp}</p>
          ) : null}
        </div>
      </div>

      <form id="produto-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
        <Tabs value={aba} onValueChange={setAba} className="gap-4">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger value="geral"><Package />Geral</TabsTrigger>
            <TabsTrigger value="classificacao"><Tags />Classificação</TabsTrigger>
            <TabsTrigger value="comercial"><CircleDollarSign />Comercial</TabsTrigger>
            <TabsTrigger value="fabricante"><Factory />Fabricante</TabsTrigger>
            <TabsTrigger value="atributos" disabled={!produto}><SlidersHorizontal />Atributos</TabsTrigger>
            <TabsTrigger value="fotos" disabled={!produto}><Images />Fotos</TabsTrigger>
          </TabsList>

          {!produto ? (
            <p className="text-xs text-muted-foreground">
              Salve o produto para habilitar as abas Atributos e Fotos.
            </p>
          ) : null}

          <TabsContent value="geral">
            <Card>
              <CardContent className="pt-6">
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Field data-invalid={!!form.formState.errors.codigoErp}>
                      <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                      <Input id="codigoErp" maxLength={30} disabled={doErp} {...form.register("codigoErp")} />
                      <FieldError errors={[form.formState.errors.codigoErp]} />
                    </Field>
                    <Field className="sm:col-span-3" data-invalid={!!form.formState.errors.descricao}>
                      <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                      <Input id="descricao" maxLength={120} disabled={doErp} {...form.register("descricao")} />
                      <FieldError errors={[form.formState.errors.descricao]} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="unidade">Unidade</FieldLabel>
                      <Input id="unidade" maxLength={4} disabled={doErp} {...form.register("unidade")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="marca">Marca</FieldLabel>
                      <Input id="marca" maxLength={40} disabled={doErp} {...form.register("marca")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="codigoBarras">Código de barras</FieldLabel>
                      <Input id="codigoBarras" maxLength={30} disabled={doErp} {...form.register("codigoBarras")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="ncm">NCM</FieldLabel>
                      <Input id="ncm" maxLength={20} disabled={doErp} {...form.register("ncm")} />
                    </Field>
                  </div>
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={form.watch("ativo")} disabled={doErp} onCheckedChange={(value) => form.setValue("ativo", value === true)} />
                    Produto ativo
                  </label>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="classificacao">
            <Card>
              <CardContent className="pt-6">
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="categoriaId">Categoria</FieldLabel>
                      <Select value={form.watch("categoriaId") ?? "none"} disabled={doErp} onValueChange={(value) => { form.setValue("categoriaId", value === "none" ? null : value); form.setValue("subCategoriaId", null); }}>
                        <SelectTrigger id="categoriaId" className="w-full"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria</SelectItem>
                          {categorias.map((categoria) => <SelectItem key={categoria.id} value={categoria.id}>{categoria.codigoErp} · {categoria.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="subCategoriaId">Subcategoria</FieldLabel>
                      <Select value={form.watch("subCategoriaId") ?? "none"} disabled={doErp} onValueChange={(value) => form.setValue("subCategoriaId", value === "none" ? null : value)}>
                        <SelectTrigger id="subCategoriaId" className="w-full"><SelectValue placeholder="Sem subcategoria" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem subcategoria</SelectItem>
                          {subcategorias.map((subcategoria) => <SelectItem key={subcategoria.id} value={subcategoria.id}>{subcategoria.codigoErp} · {subcategoria.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="armazemId">Armazém</FieldLabel>
                      <Select value={form.watch("armazemId") ?? "none"} disabled={doErp} onValueChange={(value) => form.setValue("armazemId", value === "none" ? null : value)}>
                        <SelectTrigger id="armazemId" className="w-full"><SelectValue placeholder="Sem armazém" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem armazém</SelectItem>
                          {armazens.map((armazem) => <SelectItem key={armazem.id} value={armazem.id}>{armazem.codigoErp} · {armazem.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel>Regra de desconto</FieldLabel>
                    <Input disabled value={regraDescontoLabel(produto?.regraDesconto)} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comercial">
            <Card>
              <CardContent className="pt-6">
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="codigoFornecedor">Código do fornecedor</FieldLabel>
                      <Input id="codigoFornecedor" maxLength={60} disabled={doErp} {...form.register("codigoFornecedor")} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.qtdEmbalagem}>
                      <FieldLabel htmlFor="qtdEmbalagem">Qtd. por embalagem</FieldLabel>
                      <Input id="qtdEmbalagem" type="number" step="any" disabled={doErp} {...form.register("qtdEmbalagem", { setValueAs: emptyToNull })} />
                      <FieldError errors={[form.formState.errors.qtdEmbalagem]} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.peso}>
                      <FieldLabel htmlFor="peso">Peso</FieldLabel>
                      <Input id="peso" type="number" step="any" disabled={doErp} {...form.register("peso", { setValueAs: emptyToNull })} />
                      <FieldError errors={[form.formState.errors.peso]} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.ultimoPreco}>
                      <FieldLabel htmlFor="ultimoPreco">Último preço</FieldLabel>
                      <Input id="ultimoPreco" type="number" step="any" disabled={doErp} {...form.register("ultimoPreco", { setValueAs: emptyToNull })} />
                      <FieldError errors={[form.formState.errors.ultimoPreco]} />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                    <Textarea id="observacao" rows={5} maxLength={500} disabled={doErp} {...form.register("observacao")} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fabricante">
            <Card>
              <CardContent className="pt-6">
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field>
                      <FieldLabel>Fabricante / fornecedor</FieldLabel>
                      <Input disabled value={produto?.fabricante?.nomeFantasia || produto?.fabricante?.razaoSocial || "—"} />
                    </Field>
                    <Field>
                      <FieldLabel>Chave do fabricante</FieldLabel>
                      <Input disabled value={produto?.fabricanteChave || "—"} />
                    </Field>
                    <Field>
                      <FieldLabel>Chave de integração do produto</FieldLabel>
                      <Input className="font-mono" disabled value={produto?.chave || "—"} />
                    </Field>
                    <Field>
                      <FieldLabel>Código no fabricante</FieldLabel>
                      <Input disabled value={produto?.codigoFabricante || "—"} />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel>Descrição no fabricante</FieldLabel>
                      <Input disabled value={produto?.descricaoFabricante || "—"} />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel>Dados técnicos</FieldLabel>
                    <Textarea disabled rows={7} value={produto?.dadosTecnicos || "—"} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="atributos">
            {produto ? (
              <ProdutoCamposCard
                produtoId={produto.id}
                permitirEdicao={permitirEdicaoExtras}
                mostrarVazio
              />
            ) : null}
          </TabsContent>

          <TabsContent value="fotos">
            {produto ? <ProdutoFotosCard produto={produto} permitirEdicao={permitirEdicaoExtras} /> : null}
          </TabsContent>
        </Tabs>

        <Card className="mt-4">
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>Cancelar</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || doErp}>
              {produto ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
