"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { ClientesReceitaExecucao } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/**
 * Andamento da atualização em lote pela Receita, que corre em segundo plano.
 * Enquanto roda, pergunta de novo a cada 5 s (o servidor grava o andamento a
 * cada 10 clientes); quando termina, chama `onConcluida` para a lista
 * recarregar. Mesmo molde do "Calcular" da Sugestão de compra.
 */
export function useExecucaoReceita(onConcluida: () => void) {
  const query = useQuery({
    queryKey: ["clientes", "receita", "execucao"],
    queryFn: () => apiFetch<ClientesReceitaExecucao | null>("/clientes/receita/execucoes/ultima"),
    refetchInterval: (q) => (q.state.data?.situacao === "rodando" ? 5000 : false),
  });
  const execucao = query.data ?? null;
  const anterior = useRef<string | null>(null);
  const concluida = useRef(onConcluida);
  useEffect(() => {
    concluida.current = onConcluida;
  });
  useEffect(() => {
    const chave = execucao ? `${execucao.id}:${execucao.situacao}` : null;
    const eraRodando = anterior.current?.endsWith(":rodando") ?? false;
    anterior.current = chave;
    if (!execucao || !eraRodando || execucao.situacao === "rodando") return;
    if (execucao.situacao === "concluida") {
      toast.success("Atualização dos clientes pela Receita concluída");
      concluida.current();
    } else {
      toast.error("A atualização dos clientes pela Receita falhou");
    }
  }, [execucao]);
  return { execucao, rodando: execucao?.situacao === "rodando", refetch: query.refetch };
}

export function ClientesReceitaFaixa({ execucao }: { execucao: ClientesReceitaExecucao | null }) {
  if (!execucao) return null;
  const quem = execucao.usuarioNome ? ` por ${execucao.usuarioNome}` : "";
  const r = execucao.resultado;
  if (execucao.situacao === "rodando") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        <span>
          Atualizando clientes pela Receita em segundo plano
          {r && r.total > 0 ? ` — ${r.processados} de ${r.total}` : ""} (iniciado em{" "}
          {hora(execucao.iniciadaEm)}
          {quem}). Pode continuar usando o sistema; o aviso chega no sino ao terminar.
        </span>
      </div>
    );
  }
  if (execucao.situacao === "falhou") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
        <CircleAlert className="size-4 shrink-0 text-destructive" />
        <span>
          A última atualização pela Receita ({hora(execucao.iniciadaEm)}
          {quem}) falhou{execucao.erro ? `: ${execucao.erro}` : ""}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <CircleCheck className="size-3.5 shrink-0" />
      <span>
        Última atualização pela Receita em {hora(execucao.concluidaEm ?? execucao.iniciadaEm)}
        {quem}
        {r
          ? ` · ${r.processados} consultado(s): ${r.atualizados} preenchido(s), ${r.cnaesPreenchidos} com CNAE novo, ` +
            `${r.pendentes} para aprovação, ${r.semMudanca} sem mudança` +
            (r.naoEncontrados ? `, ${r.naoEncontrados} não encontrado(s)` : "") +
            (r.falhas ? `, ${r.falhas} com falha` : "")
          : ""}
      </span>
    </div>
  );
}

/** Parâmetros do lote. A regra por campo fica dita no próprio diálogo. */
export function ClientesReceitaLoteDialog({
  open,
  onOpenChange,
  onIniciado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIniciado: () => void;
}) {
  const [somenteSemCnae, setSomenteSemCnae] = useState(false);
  const [codigoDe, setCodigoDe] = useState("");
  const [codigoAte, setCodigoAte] = useState("");

  const iniciar = useMutation({
    mutationFn: () =>
      apiFetch("/clientes/receita/lote", {
        method: "POST",
        body: {
          somenteSemCnae,
          clienteCodigoDe: codigoDe.trim() || undefined,
          clienteCodigoAte: codigoAte.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(
        "Atualização iniciada em segundo plano. Você pode continuar usando o sistema; o aviso chega no sino quando terminar.",
      );
      onIniciado();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao iniciar a atualização");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar clientes pela Receita</DialogTitle>
          <DialogDescription>
            Consulta na Receita Federal o CNPJ de cada cliente ativo e traz o CNAE (principal e
            secundários) e os dados cadastrais.
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Campo <strong className="text-foreground">vazio</strong> no cadastro é preenchido na hora
            — inclusive o CNAE de quem não tem nenhum.
          </li>
          <li>
            Campo com <strong className="text-foreground">valor diferente</strong> vai para a
            aprovação de alterações de cadastro. Diferença só de acento, maiúscula ou pontuação não
            conta.
          </li>
          <li>Uma consulta por segundo: cerca de 15 a 20 minutos para mil clientes.</li>
        </ul>

        <div className="space-y-4 py-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={somenteSemCnae} onCheckedChange={(v) => setSomenteSemCnae(v === true)} />
            Só clientes sem CNAE
          </label>

          <Field>
            <FieldLabel>Faixa de cliente (código)</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="De" value={codigoDe} onChange={(e) => setCodigoDe(e.target.value)} />
              <Input placeholder="Até" value={codigoAte} onChange={(e) => setCodigoAte(e.target.value)} />
            </div>
            <FieldDescription>
              Em branco não limita aquela ponta — vazio nos dois roda sobre todos os clientes ativos
              com CNPJ.
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => iniciar.mutate()} disabled={iniciar.isPending}>
            {iniciar.isPending ? "Iniciando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
