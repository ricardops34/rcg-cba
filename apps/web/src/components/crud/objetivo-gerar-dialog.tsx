"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ObjetivoGerar, ObjetivoGerarResultado } from "@plataforma/contracts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 3 + i);

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
 * Gera os objetivos de um mês a partir do que cada vendedor vendeu num período
 * anterior, somando um percentual. "Calcular" só mostra a proposta; "Gerar"
 * grava. Vendedor que já tem objetivo no destino é pulado pelo servidor.
 */
export function ObjetivoGerarDialog({
  open,
  onOpenChange,
  onGerado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de gerar, pra recarregar a listagem. */
  onGerado: () => void;
}) {
  const hoje = new Date();
  const mesAnterior = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
  const anoAnterior = hoje.getMonth() === 0 ? ANO_ATUAL - 1 : ANO_ATUAL;
  const [mesBase, setMesBase] = useState(mesAnterior);
  const [anoBase, setAnoBase] = useState(anoAnterior);
  const [mesDestino, setMesDestino] = useState(hoje.getMonth() + 1);
  const [anoDestino, setAnoDestino] = useState(ANO_ATUAL);
  const [modo, setModo] = useState<ObjetivoGerar["modo"]>("geral");
  const [percIncremento, setPercIncremento] = useState("0");
  const [proposta, setProposta] = useState<ObjetivoGerarResultado | null>(null);

  const gerar = useMutation({
    mutationFn: (input: ObjetivoGerar) =>
      apiFetch<ObjetivoGerarResultado>("/objetivos/gerar", { method: "POST", body: input }),
  });

  const mesmoPeriodo = mesBase === mesDestino && anoBase === anoDestino;

  // Qualquer mudança nos parâmetros invalida a proposta mostrada.
  const alterar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setProposta(null);
  };

  const executar = (simular: boolean) => {
    gerar.mutate(
      {
        mesBase,
        anoBase,
        mesDestino,
        anoDestino,
        modo,
        percIncremento: Number(percIncremento.replace(",", ".")) || 0,
        simular,
      },
      {
        onSuccess: (r) => {
          if (simular) {
            setProposta(r);
            return;
          }
          const pulados = r.pulados ? ` ${r.pulados} pulado(s) por já ter meta no destino.` : "";
          toast.success(`${r.gerados} objetivo(s) gerado(s).${pulados}`);
          onGerado();
          setProposta(null);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Erro ao gerar objetivos");
        },
      },
    );
  };

  const novos = proposta ? proposta.linhas.filter((l) => !l.jaExiste).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar objetivos pelo realizado</DialogTitle>
          <DialogDescription>
            Define a meta de cada vendedor a partir do que ele vendeu no período base, com um
            incremento opcional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="base-mes">Período base (realizado)</FieldLabel>
            <SeletorPeriodo
              idPrefixo="base"
              mes={mesBase}
              ano={anoBase}
              onMes={alterar(setMesBase)}
              onAno={alterar(setAnoBase)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="destino-mes">Gerar objetivos para</FieldLabel>
            <SeletorPeriodo
              idPrefixo="destino"
              mes={mesDestino}
              ano={anoDestino}
              onMes={alterar(setMesDestino)}
              onAno={alterar(setAnoDestino)}
            />
            {mesmoPeriodo && (
              <FieldDescription className="text-destructive">
                O destino precisa ser diferente do período base.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="gerar-modo">Tipo de objetivo</FieldLabel>
            <Select
              value={modo}
              onValueChange={alterar((v: string) => setModo(v as ObjetivoGerar["modo"]))}
            >
              <SelectTrigger id="gerar-modo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Geral (valor do mês)</SelectItem>
                <SelectItem value="categoria">Valor por categoria</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="percIncremento">Incremento (%)</FieldLabel>
            <Input
              id="percIncremento"
              inputMode="decimal"
              value={percIncremento}
              onChange={(e) => alterar(setPercIncremento)(e.target.value)}
            />
            <FieldDescription>Negativo reduz (ex.: -5). Zero repete o realizado.</FieldDescription>
          </Field>
        </div>

        {proposta && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {proposta.linhas.length} vendedor(es) — base {moeda(proposta.totalBase)}, proposta{" "}
              {moeda(proposta.totalProposto)}
              {proposta.pulados > 0 && ` (${proposta.pulados} já tem objetivo no destino e será pulado)`}
              .
            </p>
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Realizado base</TableHead>
                    <TableHead className="text-right">Meta proposta</TableHead>
                    {modo === "categoria" && <TableHead className="text-right">Categorias</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposta.linhas.map((l) => (
                    <TableRow key={l.vendedorId} className={l.jaExiste ? "opacity-50" : undefined}>
                      <TableCell>
                        {l.nome}
                        {l.jaExiste && " (já existe)"}
                      </TableCell>
                      <TableCell className="text-right">{moeda(l.realizadoBase)}</TableCell>
                      <TableCell className="text-right">{moeda(l.valor)}</TableCell>
                      {modo === "categoria" && (
                        <TableCell className="text-right">{l.categorias.length}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => executar(true)}
            disabled={mesmoPeriodo || gerar.isPending}
          >
            Calcular
          </Button>
          <Button
            onClick={() => executar(false)}
            disabled={mesmoPeriodo || gerar.isPending || (proposta !== null && novos === 0)}
          >
            {gerar.isPending ? "Gerando..." : "Gerar objetivos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
