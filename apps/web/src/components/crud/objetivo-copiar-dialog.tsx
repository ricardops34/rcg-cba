"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ObjetivoCopiarPeriodo, ObjetivoCopiarPeriodoResultado } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 3 + i);

/** Par mês+ano usado nos dois lados do diálogo (origem e destino). */
function SeletorPeriodo({
  idPrefixo,
  mes,
  ano,
  onMes,
  onAno,
}: {
  idPrefixo: string;
  mes: number;
  ano: number;
  onMes: (v: number) => void;
  onAno: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-2">
      <Select value={String(mes)} onValueChange={(v) => onMes(Number(v))}>
        <SelectTrigger id={`${idPrefixo}-mes`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((nome, i) => (
            <SelectItem key={nome} value={String(i + 1)}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(ano)} onValueChange={(v) => onAno(Number(v))}>
        <SelectTrigger id={`${idPrefixo}-ano`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ANOS.map((a) => (
            <SelectItem key={a} value={String(a)}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Copia os objetivos de um mês/ano para outro com um percentual de reajuste
 * (negativo reduz). O servidor pula vendedor que já tem meta no destino — o
 * resultado diz quantos entraram e quem ficou de fora.
 */
export function ObjetivoCopiarDialog({
  open,
  onOpenChange,
  onCopiado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de copiar, pra recarregar a listagem. */
  onCopiado: () => void;
}) {
  const mesAnterior = new Date().getMonth() === 0 ? 12 : new Date().getMonth();
  const [mesOrigem, setMesOrigem] = useState(mesAnterior);
  const [anoOrigem, setAnoOrigem] = useState(ANO_ATUAL);
  const [mesDestino, setMesDestino] = useState(new Date().getMonth() + 1);
  const [anoDestino, setAnoDestino] = useState(ANO_ATUAL);
  const [percReajuste, setPercReajuste] = useState("0");

  const copiar = useMutation({
    mutationFn: (input: ObjetivoCopiarPeriodo) =>
      apiFetch<ObjetivoCopiarPeriodoResultado>("/objetivos/copiar-periodo", {
        method: "POST",
        body: input,
      }),
  });

  const mesmoPeriodo = mesOrigem === mesDestino && anoOrigem === anoDestino;

  const onConfirmar = () => {
    copiar.mutate(
      {
        mesOrigem,
        anoOrigem,
        mesDestino,
        anoDestino,
        percReajuste: Number(percReajuste.replace(",", ".")) || 0,
      },
      {
        onSuccess: (r) => {
          const pulados = r.pulados
            ? ` ${r.pulados} pulado(s) por já ter meta no destino: ${r.vendedoresPulados.join(", ")}.`
            : "";
          toast.success(`${r.copiados} objetivo(s) copiado(s).${pulados}`);
          onCopiado();
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Erro ao copiar objetivos");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar objetivos de um período</DialogTitle>
          <DialogDescription>
            Replica as metas de todos os vendedores do período de origem, aplicando o reajuste
            sobre a meta e as linhas por categoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="origem-mes">Copiar de</FieldLabel>
            <SeletorPeriodo
              idPrefixo="origem"
              mes={mesOrigem}
              ano={anoOrigem}
              onMes={setMesOrigem}
              onAno={setAnoOrigem}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="destino-mes">Para</FieldLabel>
            <SeletorPeriodo
              idPrefixo="destino"
              mes={mesDestino}
              ano={anoDestino}
              onMes={setMesDestino}
              onAno={setAnoDestino}
            />
            {mesmoPeriodo && (
              <FieldDescription className="text-destructive">
                O destino precisa ser diferente da origem.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="percReajuste">Reajuste (%)</FieldLabel>
            <Input
              id="percReajuste"
              inputMode="decimal"
              className="sm:max-w-40"
              value={percReajuste}
              onChange={(e) => setPercReajuste(e.target.value)}
            />
            <FieldDescription>
              Use negativo para reduzir (ex.: -5). Zero copia os mesmos valores. Metas de nº de
              clientes são copiadas sem reajuste.
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={mesmoPeriodo || copiar.isPending}>
            {copiar.isPending ? "Copiando..." : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
