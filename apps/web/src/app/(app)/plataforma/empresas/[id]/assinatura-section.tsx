"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Assinatura, Plano } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Check } from "lucide-react";

export function AssinaturaSection({ empresaId }: { empresaId: string }) {
  const queryClient = useQueryClient();

  const { data: planos } = useQuery({
    queryKey: ["plataforma-planos"],
    queryFn: () => apiFetch<Plano[]>("/plataforma/planos"),
  });

  const { data: assinatura, isLoading } = useQuery({
    queryKey: ["empresa-assinatura", empresaId],
    queryFn: () => apiFetch<Assinatura>(`/plataforma/empresas/${empresaId}/assinatura`),
  });

  const [planoId, setPlanoId] = useState("");
  const [situacao, setSituacao] = useState<string>("ativa");
  const [ciclo, setCiclo] = useState<string>("mensal");
  const [valorMensalidade, setValorMensalidade] = useState("0");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (assinatura) {
      setPlanoId(assinatura.planoId || "");
      setSituacao(assinatura.situacao || "ativa");
      setCiclo(assinatura.ciclo || "mensal");
      setValorMensalidade(assinatura.valorMensalidade?.toString() || "0");
      setDiaVencimento(assinatura.diaVencimento?.toString() || "10");
      setObservacoes(assinatura.observacoes || "");
    }
  }, [assinatura]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch(`/plataforma/empresas/${empresaId}/assinatura`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      toast.success("Assinatura e mensalidade atualizadas");
      queryClient.invalidateQueries({ queryKey: ["empresa-assinatura", empresaId] });
      queryClient.invalidateQueries({ queryKey: ["plataforma-assinaturas-resumo"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao atualizar assinatura");
    },
  });

  const onPlanoChange = (pId: string) => {
    setPlanoId(pId);
    const p = planos?.find((x) => x.id === pId);
    if (p) {
      if (ciclo === "anual") setValorMensalidade(p.valorAnual?.toString() || p.valorMensal.toString());
      else if (ciclo === "semestral") setValorMensalidade(p.valorSemestral?.toString() || p.valorMensal.toString());
      else if (ciclo === "trimestral") setValorMensalidade(p.valorTrimestral?.toString() || p.valorMensal.toString());
      else setValorMensalidade(p.valorMensal.toString());
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      planoId,
      situacao,
      ciclo,
      valorMensalidade: Number(valorMensalidade),
      diaVencimento: Number(diaVencimento),
      observacoes,
    });
  };

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="size-5 text-primary" /> Pacote, Assinatura & Mensalidade
        </CardTitle>
        <CardDescription>
          Defina o pacote contratado por esta empresa, ciclo de cobrança e valor da mensalidade.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Pacote / Plano Contratado</FieldLabel>
              <Select value={planoId} onValueChange={onPlanoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {planos?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Ciclo de Cobrança</FieldLabel>
              <Select value={ciclo} onValueChange={setCiclo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Situação da Assinatura</FieldLabel>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="teste">Período de Teste</SelectItem>
                  <SelectItem value="atrasada">Atrasada / Inadimplente</SelectItem>
                  <SelectItem value="suspensa">Suspensa</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Valor Cobrado (R$)</FieldLabel>
              <Input
                type="number"
                step="any"
                value={valorMensalidade}
                onChange={(e) => setValorMensalidade(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel>Dia de Vencimento</FieldLabel>
              <Input
                type="number"
                min="1"
                max="31"
                value={diaVencimento}
                onChange={(e) => setDiaVencimento(e.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Observações da Assinatura</FieldLabel>
            <Textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Anotações internas sobre negociação, descontos ou contrato..."
            />
          </Field>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              <Check className="mr-1 size-4" />
              {mutation.isPending ? "Salvando..." : "Salvar Assinatura"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
