"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  produtoCreateSchema,
  produtoUpdateSchema,
  type Produto,
  type ProdutoCreate,
  type ProdutoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/produtos";

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const nanToNull = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? null : v;

export function ProdutoForm({ produto }: { produto?: Produto }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<ProdutoCreate, ProdutoUpdate>("produtos");

  const schema = produto ? produtoUpdateSchema : produtoCreateSchema;
  const empty: ProdutoCreate = {
    codigoErp: "",
    descricao: "",
    unidade: "",
    categoria: "",
    subCategoria: "",
    marca: "",
    codigoBarras: "",
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
          categoria: produto.categoria ?? "",
          subCategoria: produto.subCategoria ?? "",
          marca: produto.marca ?? "",
          codigoBarras: produto.codigoBarras ?? "",
          ncm: produto.ncm ?? "",
          qtdEmbalagem: produto.qtdEmbalagem ?? null,
          peso: produto.peso ?? null,
          ultimoPreco: produto.ultimoPreco ?? null,
          observacao: produto.observacao ?? "",
          ativo: produto.ativo,
        }
      : empty,
  });

  const onSubmit = async (values: ProdutoCreate) => {
    const payload: ProdutoCreate = {
      ...values,
      qtdEmbalagem: nanToNull(values.qtdEmbalagem),
      peso: nanToNull(values.peso),
      ultimoPreco: nanToNull(values.ultimoPreco),
    };
    try {
      if (produto) {
        await update.mutateAsync({ id: produto.id, input: payload });
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

      <Card>
        <form id="produto-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.codigoErp}>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                  <FieldError errors={[form.formState.errors.codigoErp]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="unidade">Unidade</FieldLabel>
                  <Input id="unidade" maxLength={4} {...form.register("unidade")} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.descricao}>
                <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                <Input id="descricao" {...form.register("descricao")} />
                <FieldError errors={[form.formState.errors.descricao]} />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="categoria">Categoria</FieldLabel>
                  <Input id="categoria" {...form.register("categoria")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="subCategoria">Subcategoria</FieldLabel>
                  <Input id="subCategoria" {...form.register("subCategoria")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="marca">Marca</FieldLabel>
                  <Input id="marca" {...form.register("marca")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="codigoBarras">Código de barras</FieldLabel>
                  <Input id="codigoBarras" {...form.register("codigoBarras")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="ncm">NCM</FieldLabel>
                  <Input id="ncm" {...form.register("ncm")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.qtdEmbalagem}>
                  <FieldLabel htmlFor="qtdEmbalagem">Qtd. embalagem</FieldLabel>
                  <Input
                    id="qtdEmbalagem"
                    type="number"
                    step="any"
                    {...form.register("qtdEmbalagem", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.qtdEmbalagem]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.peso}>
                  <FieldLabel htmlFor="peso">Peso</FieldLabel>
                  <Input id="peso" type="number" step="any" {...form.register("peso", { setValueAs: emptyToNull })} />
                  <FieldError errors={[form.formState.errors.peso]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.ultimoPreco}>
                  <FieldLabel htmlFor="ultimoPreco">Último preço</FieldLabel>
                  <Input
                    id="ultimoPreco"
                    type="number"
                    step="any"
                    {...form.register("ultimoPreco", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.ultimoPreco]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                  <Input id="observacao" {...form.register("observacao")} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Produto ativo
              </label>
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
