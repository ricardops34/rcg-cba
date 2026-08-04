"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  atividadeCreateSchema,
  atividadeUpdateSchema,
  type Atividade,
  type AtividadeCreate,
  type AtividadeUpdate,
  type Oportunidade,
  type TipoAtividade,
  type Vendedor,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/crm/atividades";

const TIPOS: { value: TipoAtividade; label: string }[] = [
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "email", label: "E-mail" },
  { value: "visita", label: "Visita" },
  { value: "tarefa", label: "Tarefa" },
];

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));

export function AtividadeForm({
  atividade,
  dataVencimentoInicial,
}: {
  atividade?: Atividade;
  dataVencimentoInicial?: Date;
}) {
  const router = useRouter();
  const { create, update } = useResourceMutations<AtividadeCreate, AtividadeUpdate>("atividades");

  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[]; restrito: boolean; ehVendedorPuro: boolean }>(
        "/clientes/vendedores-escopo",
      ),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const schema = atividade ? atividadeUpdateSchema : atividadeCreateSchema;
  const empty: AtividadeCreate = {
    clienteId: null,
    oportunidadeId: null,
    vendedorId: "",
    tipo: "tarefa",
    titulo: "",
    descricao: "",
    dataVencimento: dataVencimentoInicial ?? null,
    concluida: false,
    dataConclusao: null,
    ativo: true,
  };
  const form = useForm<AtividadeCreate>({
    resolver: zodResolver(schema as typeof atividadeCreateSchema),
    defaultValues: atividade
      ? {
          clienteId: atividade.clienteId,
          oportunidadeId: atividade.oportunidadeId,
          vendedorId: atividade.vendedorId,
          tipo: atividade.tipo,
          titulo: atividade.titulo,
          descricao: atividade.descricao ?? "",
          dataVencimento: atividade.dataVencimento ? new Date(atividade.dataVencimento) : null,
          concluida: atividade.concluida,
          dataConclusao: atividade.dataConclusao ? new Date(atividade.dataConclusao) : null,
          ativo: atividade.ativo,
        }
      : empty,
  });

  const vendedorId = form.watch("vendedorId");
  const concluida = form.watch("concluida");

  // Oportunidades do vendedor escolhido — só as ativas, pra não linkar numa
  // oportunidade já ganha/perdida por engano.
  const oportunidadesQuery = useQuery({
    queryKey: ["oportunidades", "select", vendedorId],
    queryFn: () =>
      apiFetch<{ data: Oportunidade[] }>("/oportunidades", {
        query: { vendedorId, pageSize: 100, ativo: true },
      }),
    enabled: !!vendedorId,
  });
  const opcoesOportunidade = oportunidadesQuery.data?.data ?? [];

  const onSubmit = async (values: AtividadeCreate) => {
    try {
      if (atividade) {
        await update.mutateAsync({ id: atividade.id, input: values });
        toast.success("Atividade atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Atividade cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar atividade");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {atividade ? "Editar atividade" : "Nova atividade"}
        </h1>
      </div>

      <Card>
        <form id="atividade-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field className="sm:col-span-2" data-invalid={!!form.formState.errors.titulo}>
                  <FieldLabel htmlFor="titulo">Título</FieldLabel>
                  <Input id="titulo" {...form.register("titulo")} />
                  <FieldError errors={[form.formState.errors.titulo]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
                  <Select
                    value={form.watch("tipo")}
                    onValueChange={(v) => form.setValue("tipo", v as TipoAtividade)}
                  >
                    <SelectTrigger id="tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <Field>
                  <FieldLabel htmlFor="clienteId">Cliente</FieldLabel>
                  <ClienteCombobox
                    value={form.watch("clienteId") ?? null}
                    onChange={(id) => form.setValue("clienteId", id)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="oportunidadeId">Oportunidade</FieldLabel>
                <Select
                  value={form.watch("oportunidadeId") ?? "none"}
                  onValueChange={(v) => form.setValue("oportunidadeId", v === "none" ? null : v)}
                  disabled={!vendedorId}
                >
                  <SelectTrigger id="oportunidadeId" className="w-full">
                    <SelectValue placeholder={vendedorId ? "Sem oportunidade" : "Escolha um vendedor primeiro"} />
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
                <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                <Textarea id="descricao" rows={3} {...form.register("descricao")} />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="dataVencimento">Vencimento</FieldLabel>
                  <Input
                    id="dataVencimento"
                    type="date"
                    defaultValue={dateToInput(form.getValues("dataVencimento"))}
                    onChange={(e) => form.setValue("dataVencimento", inputToDate(e.target.value))}
                  />
                </Field>
                {atividade && concluida && (
                  <Field>
                    <FieldLabel htmlFor="dataConclusao">Concluída em</FieldLabel>
                    <Input
                      id="dataConclusao"
                      type="date"
                      defaultValue={dateToInput(form.getValues("dataConclusao"))}
                      onChange={(e) => form.setValue("dataConclusao", inputToDate(e.target.value))}
                    />
                  </Field>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={concluida}
                    onCheckedChange={(v) => form.setValue("concluida", v === true)}
                  />
                  Concluída
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("ativo")}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  Ativa
                </label>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {atividade ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
