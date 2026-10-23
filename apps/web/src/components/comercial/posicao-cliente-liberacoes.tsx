"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Orcamento } from "@plataforma/contracts";
import { numeroOrcamento } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { OrcamentoSheet, type OrcamentoSheetAlvo } from "@/components/crud/orcamento-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dataHoraBr = (v: string | null | undefined) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("pt-BR") : "—";
};
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Orçamentos do cliente com pedido de liberação de desconto em aberto.
 *
 * A decisão é tomada na Posição de Cliente porque o supervisor precisa do
 * contexto — títulos em aberto, histórico de compras e de atendimento — para
 * liberar ou recusar. O aviso no sino leva direto para esta aba.
 */
export function useLiberacoesPendentes(clienteId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ["orcamentos", "liberacoes-pendentes", clienteId],
    enabled: habilitado,
    queryFn: async () => {
      const r = await apiFetch<{ data: Orcamento[] }>("/orcamentos", {
        query: { clienteId, ativo: true, pageSize: 100, sortBy: "createdAt", sortOrder: "desc" },
      });
      return r.data.filter((o) => o.descontoSolicitadoEm && !o.descontoAutorizadoEm);
    },
  });
}

export function LiberacoesDesconto({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const { data: pendentes = [], isLoading } = useLiberacoesPendentes(clienteId, true);
  const [abrir, setAbrir] = useState<OrcamentoSheetAlvo | null>(null);
  const [decidindo, setDecidindo] = useState<{ orcamento: Orcamento; acao: "autorizar" | "recusar" } | null>(
    null,
  );
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);

  const decidir = async () => {
    if (!decidindo) return;
    setEnviando(true);
    try {
      await apiFetch(
        `/orcamentos/${decidindo.orcamento.id}/${decidindo.acao === "autorizar" ? "autorizar-desconto" : "recusar-desconto"}`,
        { method: "POST", body: { justificativa: justificativa.trim() } },
      );
      toast.success(
        decidindo.acao === "autorizar"
          ? "Desconto autorizado — o vendedor foi avisado"
          : "Desconto recusado — o vendedor foi avisado",
      );
      setDecidindo(null);
      setJustificativa("");
      void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir a ação");
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (pendentes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum pedido de liberação de desconto em aberto.</p>;
  }

  return (
    <div className="space-y-4">
      {pendentes.map((o) => (
        <div key={o.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Orçamento nº {numeroOrcamento(o)} — {moeda(o.vlrTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {o.vendedor.nomeReduzido || o.vendedor.nome} · solicitado em {dataHoraBr(o.descontoSolicitadoEm)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAbrir({ modo: "editar", id: o.id })}>
                Ver orçamento
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDecidindo({ orcamento: o, acao: "recusar" })}>
                Recusar
              </Button>
              <Button type="button" size="sm" onClick={() => setDecidindo({ orcamento: o, acao: "autorizar" })}>
                Autorizar
              </Button>
            </div>
          </div>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Tabela</TableHead>
                <TableHead className="text-right">Unitário</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.produto.codigoErp} — {i.produto.descricao}
                  </TableCell>
                  <TableCell className="text-right">{i.quantidade}</TableCell>
                  <TableCell className="text-right">{i.vlrTabela != null ? moeda(i.vlrTabela) : "—"}</TableCell>
                  <TableCell className="text-right">{moeda(i.vlrUnitario)}</TableCell>
                  <TableCell className="text-right">
                    {i.percDesconto != null ? `${i.percDesconto.toLocaleString("pt-BR")}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      <OrcamentoSheet alvo={abrir} onOpenChange={(aberto) => !aberto && setAbrir(null)} />

      <Dialog open={!!decidindo} onOpenChange={(aberto) => !aberto && setDecidindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decidindo?.acao === "recusar" ? "Recusar desconto" : "Autorizar desconto"}</DialogTitle>
            <DialogDescription>
              {decidindo?.acao === "recusar"
                ? "Informe o motivo da recusa. O vendedor é avisado e vê o motivo no orçamento."
                : "Informe a justificativa da liberação. Ela fica registrada no histórico do orçamento."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            maxLength={500}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Justificativa"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDecidindo(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={enviando || justificativa.trim().length < 5} onClick={() => void decidir()}>
              {decidindo?.acao === "recusar" ? "Recusar" : "Autorizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
