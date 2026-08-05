"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  oportunidadeCreateSchema,
  oportunidadeUpdateSchema,
  type EstagioOportunidade,
  type Oportunidade,
  type OportunidadeCreate,
  type OportunidadeUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/crm/oportunidades";

const ESTAGIOS: { value: EstagioOportunidade; label: string }[] = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "proposta", label: "Proposta" },
  { value: "negociacao", label: "Negociação" },
  { value: "ganha", label: "Ganha" },
  { value: "perdida", label: "Perdida" },
];

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));
const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

export function OportunidadeForm({ oportunidade }: { oportunidade?: Oportunidade }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<OportunidadeCreate, OportunidadeUpdate>(
    "oportunidades",
  );

  // Vendedores já restritos ao escopo hierárquico do usuário logado.
  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const schema = oportunidade ? oportunidadeUpdateSchema : oportunidadeCreateSchema;
  const empty: OportunidadeCreate = {
    clienteId: "",
    vendedorId: "",
    titulo: "",
    estagio: "prospeccao",
    valorPrevisto: null,
    dataPrevisao: null,
    dataFechamento: null,
    motivoPerda: "",
    observacao: "",
    ativo: true,
  };
  const form = useForm<OportunidadeCreate>({
    resolver: zodResolver(schema as typeof oportunidadeCreateSchema),
    defaultValues: oportunidade
      ? {
          clienteId: oportunidade.clienteId,
          vendedorId: oportunidade.vendedorId,
          titulo: oportunidade.titulo,
          estagio: oportunidade.estagio,
          valorPrevisto: oportunidade.valorPrevisto,
          dataPrevisao: oportunidade.dataPrevisao ? new Date(oportunidade.dataPrevisao) : null,
          dataFechamento: oportunidade.dataFechamento
            ? new Date(oportunidade.dataFechamento)
            : null,
          motivoPerda: oportunidade.motivoPerda ?? "",
          observacao: oportunidade.observacao ?? "",
          ativo: oportunidade.ativo,
        }
      : empty,
  });

  const estagio = form.watch("estagio");

  // Ao criar (não editar), pré-seleciona o próprio vendedor do usuário
  // logado, se houver vínculo — só na primeira carga.
  const [vendedorPadraoAplicado, setVendedorPadraoAplicado] = useState(false);
  const meuVendedorId = vendedoresEscopoQuery.data?.meuVendedorId;
  useEffect(() => {
    if (!oportunidade && !vendedorPadraoAplicado && meuVendedorId) {
      form.setValue("vendedorId", meuVendedorId);
      setVendedorPadraoAplicado(true);
    }
  }, [oportunidade, vendedorPadraoAplicado, meuVendedorId, form]);

  const onSubmit = async (values: OportunidadeCreate) => {
    const payload: OportunidadeCreate = {
      ...values,
      valorPrevisto: emptyToNull(values.valorPrevisto),
    };
    try {
      if (oportunidade) {
        await update.mutateAsync({ id: oportunidade.id, input: payload });
        toast.success("Oportunidade atualizada");
      } else {
        await create.mutateAsync(payload);
        toast.success("Oportunidade cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar oportunidade");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {oportunidade ? "Editar oportunidade" : "Nova oportunidade"}
        </h1>
      </div>

      <Card>
        <form id="oportunidade-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
                    value={form.watch("vendedorId") || undefined}
                    onValueChange={(v) => form.setValue("vendedorId", v)}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="estagio">Estágio</FieldLabel>
                  <Select
                    value={estagio}
                    onValueChange={(v) => form.setValue("estagio", v as EstagioOportunidade)}
                  >
                    <SelectTrigger id="estagio" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTAGIOS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-invalid={!!form.formState.errors.valorPrevisto}>
                  <FieldLabel htmlFor="valorPrevisto">Valor previsto</FieldLabel>
                  <Input
                    id="valorPrevisto"
                    type="number"
                    step="0.01"
                    min={0}
                    {...form.register("valorPrevisto", { setValueAs: emptyToNull })}
                  />
                  <FieldError errors={[form.formState.errors.valorPrevisto]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dataPrevisao">Previsão de fechamento</FieldLabel>
                  <Input
                    id="dataPrevisao"
                    type="date"
                    defaultValue={dateToInput(form.getValues("dataPrevisao"))}
                    onChange={(e) => form.setValue("dataPrevisao", inputToDate(e.target.value))}
                  />
                </Field>
              </div>

              {(estagio === "ganha" || estagio === "perdida") && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="dataFechamento">Data de fechamento</FieldLabel>
                    <Input
                      id="dataFechamento"
                      type="date"
                      defaultValue={dateToInput(form.getValues("dataFechamento"))}
                      onChange={(e) => form.setValue("dataFechamento", inputToDate(e.target.value))}
                    />
                  </Field>
                  {estagio === "perdida" && (
                    <Field>
                      <FieldLabel htmlFor="motivoPerda">Motivo da perda</FieldLabel>
                      <Input id="motivoPerda" {...form.register("motivoPerda")} />
                    </Field>
                  )}
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                <Textarea id="observacao" rows={3} {...form.register("observacao")} />
              </Field>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch("ativo")}
                  onCheckedChange={(v) => form.setValue("ativo", v === true)}
                />
                Oportunidade ativa
              </label>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {oportunidade ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
