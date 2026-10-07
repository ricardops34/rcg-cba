"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SugestaoCompraExcluirResultado, SugestaoCompraGerarResultado } from "@plataforma/contracts";
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

  // Um cliente é rápido e responde com o resultado. O lote corre em segundo
  // plano: a API só registra a execução, e a tela acompanha o andamento.
  const gerar = useMutation({
    mutationFn: async (): Promise<SugestaoCompraGerarResultado | null> => {
      if (clienteId) {
        return apiFetch<SugestaoCompraGerarResultado>(`/sugestao-compra/cliente/${clienteId}/gerar`, {
          method: "POST",
          body: { meses: mesesNumero },
        });
      }
      await apiFetch("/sugestao-compra/gerar", {
        method: "POST",
        body: {
          meses: mesesNumero,
          clienteCodigoDe: codigoDe.trim() || undefined,
          clienteCodigoAte: codigoAte.trim() || undefined,
        },
      });
      return null;
    },
    onSuccess: (r) => {
      // CPF ou sem CNAE: não há ramo para comparar — o motivo vem da API.
      if (r?.aviso) {
        toast.info(r.aviso);
        onGerado();
        onOpenChange(false);
        return;
      }
      toast.success(
        r
          ? r.sugestoesGravadas > 0
            ? `${r.sugestoesGravadas} produto(s) sugerido(s).`
            : "Nenhuma sugestão encontrada para este cliente no período."
          : "Cálculo iniciado em segundo plano. Você pode continuar usando o sistema; o aviso chega no sino quando terminar.",
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
              : "Recalcula os clientes CNPJ com CNAE, ativos e não bloqueados, dentro do seu escopo: sugere o que clientes do mesmo ramo, com compras parecidas, compram e o cliente não. A sugestão anterior da faixa é substituída (CPF e cliente sem CNAE ficam sem). Roda em segundo plano: você não precisa esperar nesta tela."}
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

/**
 * Exclui a sugestão calculada de uma faixa de código de cliente (vazia nas
 * duas pontas = todo o escopo do usuário). A de um cliente só sai pelo menu
 * da linha.
 */
export function SugestaoCompraExcluirDialog({
  open,
  onOpenChange,
  onExcluido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExcluido: () => void;
}) {
  const [codigoDe, setCodigoDe] = useState("");
  const [codigoAte, setCodigoAte] = useState("");

  const excluir = useMutation({
    mutationFn: () =>
      apiFetch<SugestaoCompraExcluirResultado>("/sugestao-compra/excluir", {
        method: "POST",
        body: {
          clienteCodigoDe: codigoDe.trim() || undefined,
          clienteCodigoAte: codigoAte.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.sugestoesExcluidas > 0
          ? `${r.sugestoesExcluidas} sugestão(ões) excluída(s) de ${r.clientes} cliente(s).`
          : "Nenhuma sugestão calculada na faixa.",
      );
      onExcluido();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir o cálculo");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir cálculo da sugestão</DialogTitle>
          <DialogDescription>
            Apaga a sugestão calculada dos clientes do seu escopo na faixa. Os clientes ficam sem
            sugestão até o próximo Calcular.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Faixa de cliente (código)</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="De" value={codigoDe} onChange={(e) => setCodigoDe(e.target.value)} />
            <Input placeholder="Até" value={codigoAte} onChange={(e) => setCodigoAte(e.target.value)} />
          </div>
          <FieldDescription>
            Em branco não limita aquela ponta — vazio nos dois exclui de todo o seu escopo.
          </FieldDescription>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => excluir.mutate()} disabled={excluir.isPending}>
            {excluir.isPending ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
