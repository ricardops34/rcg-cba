"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SugestaoCompraGerarResultado } from "@plataforma/contracts";
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

const MESES_OPCOES = ["padrao", "6", "12", "24"] as const;

/**
 * Recalcula a sugestão de compra: de um cliente só (row action, `clienteId`
 * informado) ou em lote sobre uma faixa de código (toolbar, `clienteId`
 * ausente). As duas rotas sobrescrevem o que já estava gravado para os
 * clientes atingidos — o texto do diálogo muda de acordo para deixar isso
 * explícito antes de confirmar.
 */
export function SugestaoCompraGerarDialog({
  open,
  onOpenChange,
  clienteId,
  razaoSocial,
  onGerado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente = recalcula só este cliente; ausente = lote por faixa. */
  clienteId?: string | null;
  razaoSocial?: string;
  onGerado: () => void;
}) {
  const [meses, setMeses] = useState<(typeof MESES_OPCOES)[number]>("padrao");
  const [codigoDe, setCodigoDe] = useState("");
  const [codigoAte, setCodigoAte] = useState("");

  const mesesNumero = meses === "padrao" ? undefined : Number(meses);

  const gerar = useMutation({
    mutationFn: () =>
      clienteId
        ? apiFetch<SugestaoCompraGerarResultado>(`/sugestao-compra/cliente/${clienteId}/gerar`, {
            method: "POST",
            body: { meses: mesesNumero },
          })
        : apiFetch<SugestaoCompraGerarResultado>("/sugestao-compra/gerar", {
            method: "POST",
            body: {
              meses: mesesNumero,
              clienteCodigoDe: codigoDe.trim() || undefined,
              clienteCodigoAte: codigoAte.trim() || undefined,
            },
          }),
    onSuccess: (r) => {
      toast.success(
        clienteId
          ? r.sugestoesGravadas > 0
            ? `${r.sugestoesGravadas} produto(s) sugerido(s).`
            : "Nenhuma sugestão encontrada para este cliente no período."
          : `${r.clientesComSugestao} de ${r.clientesProcessados} cliente(s) ganharam sugestão (${r.sugestoesGravadas} linha(s)).`,
      );
      onGerado();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao calcular sugestão");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {clienteId ? `Calcular sugestão${razaoSocial ? ` — ${razaoSocial}` : ""}` : "Calcular sugestão em lote"}
          </DialogTitle>
          <DialogDescription>
            {clienteId
              ? "Recalcula este cliente e substitui a sugestão gravada para ele."
              : "Recalcula os clientes ativos e não bloqueados dentro do seu escopo, substituindo a sugestão já gravada para cada um deles. Pode levar alguns minutos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="sugestao-meses">Período de referência</FieldLabel>
            <Select value={meses} onValueChange={(v) => setMeses(v as (typeof MESES_OPCOES)[number])}>
              <SelectTrigger id="sugestao-meses" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão da empresa</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="24">24 meses</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {!clienteId && (
            <Field>
              <FieldLabel>Faixa de cliente (código)</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="De"
                  value={codigoDe}
                  onChange={(e) => setCodigoDe(e.target.value)}
                />
                <Input
                  placeholder="Até"
                  value={codigoAte}
                  onChange={(e) => setCodigoAte(e.target.value)}
                />
              </div>
              <FieldDescription>
                Em branco não limita aquela ponta — vazio nos dois roda sobre todo o seu escopo.
              </FieldDescription>
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => gerar.mutate()} disabled={gerar.isPending}>
            {gerar.isPending ? "Calculando..." : "Calcular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
