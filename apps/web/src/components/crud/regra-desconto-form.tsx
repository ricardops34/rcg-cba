"use client";

import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  regraDescontoCreateSchema,
  regraDescontoUpdateSchema,
  type RegraDesconto,
  type RegraDescontoCreate,
  type RegraDescontoUpdate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const LIST_ROUTE = "/cadastros/regras-desconto";

/**
 * Cadastro de regra de desconto (mestre-detalhe). O cabeçalho define os tetos
 * e a comissão cheia; as faixas dizem quanto dessa comissão o vendedor recebe
 * em cada intervalo de desconto. As faixas são gravadas junto, no mesmo corpo
 * — o backend substitui o conjunto inteiro a cada gravação.
 */
export function RegraDescontoForm({ regra }: { regra?: RegraDesconto }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<RegraDescontoCreate, RegraDescontoUpdate>(
    "regras-desconto",
  );

  const form = useForm<RegraDescontoCreate>({
    resolver: zodResolver(regra ? regraDescontoUpdateSchema : regraDescontoCreateSchema),
    defaultValues: {
      codigoErp: regra?.codigoErp ?? "",
      descricao: regra?.descricao ?? "",
      percDescontoAutorizado: regra?.percDescontoAutorizado ?? 0,
      percDescontoMaximo: regra?.percDescontoMaximo ?? 0,
      percComissao: regra?.percComissao ?? 0,
      padrao: regra?.padrao ?? false,
      ativo: regra?.ativo ?? true,
      faixas:
        regra?.faixas.map((f) => ({
          sequencia: f.sequencia,
          percInicial: f.percInicial,
          percFinal: f.percFinal,
          percBaseComissao: f.percBaseComissao,
        })) ?? [],
    },
  });

  const faixas = useFieldArray({ control: form.control, name: "faixas" });
  const linhasAtuais = form.watch("faixas") ?? [];
  const padrao = form.watch("padrao");
  const ativo = form.watch("ativo");

  // Nova faixa começa onde a anterior terminou: o desconto segue de onde parou
  // (+0,01) e a comissão cai um degrau, que é como as regras do ERP são feitas.
  const adicionarFaixa = () => {
    const ultima = linhasAtuais[linhasAtuais.length - 1];
    faixas.append({
      sequencia: (ultima?.sequencia ?? 0) + 1,
      percInicial: ultima ? Math.round((ultima.percFinal + 0.01) * 100) / 100 : 0,
      percFinal: ultima?.percFinal ?? 0,
      percBaseComissao: ultima ? Math.max(0, ultima.percBaseComissao - 10) : 100,
    });
  };

  const onSubmit = async (values: RegraDescontoCreate) => {
    const payload = { ...values, codigoErp: values.codigoErp?.trim() || null };
    try {
      if (regra) {
        await update.mutateAsync({ id: regra.id, input: payload });
        toast.success("Regra atualizada");
      } else {
        await create.mutateAsync(payload);
        toast.success("Regra cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar regra");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {regra ? `Editar regra ${regra.descricao}` : "Nova regra de desconto"}
        </h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
                <Field data-invalid={!!form.formState.errors.codigoErp}>
                  <FieldLabel htmlFor="codigoErp">Código no ERP</FieldLabel>
                  <Input id="codigoErp" maxLength={30} {...form.register("codigoErp")} />
                  <FieldDescription>
                    Chave usada pela integração. Em branco para regras criadas só aqui.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.codigoErp]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.descricao}>
                  <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
                  <Input id="descricao" maxLength={120} {...form.register("descricao")} />
                  <FieldError errors={[form.formState.errors.descricao]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.percDescontoMaximo}>
                  <FieldLabel htmlFor="percDescontoMaximo">% desconto máximo</FieldLabel>
                  <Input
                    id="percDescontoMaximo"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    {...form.register("percDescontoMaximo", { valueAsNumber: true })}
                  />
                  <FieldDescription>Z0_PERMAX no ERP.</FieldDescription>
                  <FieldError errors={[form.formState.errors.percDescontoMaximo]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.percDescontoAutorizado}>
                  <FieldLabel htmlFor="percDescontoAutorizado">% desconto autorizado</FieldLabel>
                  <Input
                    id="percDescontoAutorizado"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    {...form.register("percDescontoAutorizado", { valueAsNumber: true })}
                  />
                  <FieldDescription>Z0_DESCAUT no ERP.</FieldDescription>
                  <FieldError errors={[form.formState.errors.percDescontoAutorizado]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.percComissao}>
                  <FieldLabel htmlFor="percComissao">% de comissão</FieldLabel>
                  <Input
                    id="percComissao"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    {...form.register("percComissao", { valueAsNumber: true })}
                  />
                  <FieldDescription>Comissão cheia, base das faixas abaixo.</FieldDescription>
                  <FieldError errors={[form.formState.errors.percComissao]} />
                </Field>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={padrao}
                    onCheckedChange={(v) => form.setValue("padrao", v === true)}
                  />
                  Regra padrão
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={ativo}
                    onCheckedChange={(v) => form.setValue("ativo", v === true)}
                  />
                  Ativa
                </label>
              </div>
              {padrao && (
                <FieldDescription>
                  Ao salvar, a regra padrão anterior deixa de ser padrão — só uma por empresa.
                </FieldDescription>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Faixas de comissão</p>
                <p className="text-sm text-muted-foreground">
                  Dentro de cada intervalo de desconto, o vendedor recebe a porcentagem indicada
                  da comissão cheia ({form.watch("percComissao") || 0}%). Os intervalos não podem
                  se sobrepor.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={adicionarFaixa}>
                <Plus className="size-4" />
                Adicionar faixa
              </Button>
            </div>

            {faixas.fields.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma faixa — a regra vale só pelos limites de desconto acima.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Seq.</TableHead>
                    <TableHead className="text-right">Desconto de (%)</TableHead>
                    <TableHead className="text-right">Desconto até (%)</TableHead>
                    <TableHead className="text-right">% da comissão</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faixas.fields.map((faixa, index) => (
                    <TableRow key={faixa.id}>
                      <TableCell className="px-1.5">
                        <Input
                          type="number"
                          min={1}
                          className="w-16"
                          {...form.register(`faixas.${index}.sequencia`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="px-1.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          className="w-24 text-right"
                          {...form.register(`faixas.${index}.percInicial`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="px-1.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          className="w-24 text-right"
                          {...form.register(`faixas.${index}.percFinal`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="px-1.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          className="w-24 text-right"
                          {...form.register(`faixas.${index}.percBaseComissao`, {
                            valueAsNumber: true,
                          })}
                        />
                      </TableCell>
                      <TableCell className="px-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => faixas.remove(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {regra ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
