"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarPlus,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Receipt,
  Wrench,
} from "lucide-react";
import type { Orcamento } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { STATUS_ORCAMENTO_LABEL } from "@/components/crud/orcamento-status";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Ações do sistema dentro da conversa.
 *
 * Só aparecem para contato **vinculado a cliente**: sem saber com quem se
 * fala, não há título nem nota a consultar. E cada item respeita a permissão
 * da rotina dona do dado — o botão some para quem não pode ver aquilo no
 * sistema, e a rota recusa de qualquer forma se for chamada direto.
 */
export function AcoesCliente({
  conversaId,
  onAbrirPosicao,
  onAbrirOrcamento,
}: {
  conversaId: string;
  /**
   * Posição e orçamento não abrem daqui: viram o painel da direita, que
   * empurra a conversa em vez de cobri-la. Quem controla essa coluna é a
   * tela, então a decisão sobe — este componente só avisa.
   */
  onAbrirPosicao: () => void;
  onAbrirOrcamento: () => void;
}) {
  const queryClient = useQueryClient();
  const [agendando, setAgendando] = useState(false);
  const [enviandoOrcamento, setEnviandoOrcamento] = useState(false);
  const permissoes = useAuthStore((s) => s.user?.permissoes);

  // Mesma leitura do menu lateral: a lista já vem resolvida pelo perfil, e o
  // administrador chega aqui com todas. A rota confere de novo — esconder
  // botão não é autorização.
  const pode = (permissao: string) => Boolean(permissoes?.includes(permissao));

  const executar = useMutation({
    mutationFn: (acao: "titulos" | "notas") =>
      apiFetch(`/whatsapp/conversas/${conversaId}/acoes/${acao}`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Enviado para o cliente");
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar"),
  });

  const podeTitulos = pode("titulos-receber.visualizar");
  const podeNotas = pode("notas-saida.visualizar");
  const podeAgendar = pode("atividades.cadastrar");
  const podeOrcamento = pode("orcamentos.visualizar");
  const podeCriarOrcamento = pode("orcamentos.cadastrar");
  const podePosicao = pode("posicao-cliente.visualizar");
  if (
    !podeTitulos &&
    !podeNotas &&
    !podeAgendar &&
    !podeOrcamento &&
    !podeCriarOrcamento &&
    !podePosicao
  ) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" title="Ações do sistema">
            <Wrench className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuLabel>Ações do sistema</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {podeTitulos ? (
            <DropdownMenuItem
              disabled={executar.isPending}
              onClick={() => executar.mutate("titulos")}
            >
              <Receipt className="size-4" />
              Enviar títulos em aberto
            </DropdownMenuItem>
          ) : null}
          {podeNotas ? (
            <DropdownMenuItem
              disabled={executar.isPending}
              onClick={() => executar.mutate("notas")}
            >
              <FileSpreadsheet className="size-4" />
              Enviar últimas notas
            </DropdownMenuItem>
          ) : null}
          {podePosicao ? (
            <DropdownMenuItem onClick={onAbrirPosicao}>
              <BarChart3 className="size-4" />
              Ver posição do cliente
            </DropdownMenuItem>
          ) : null}
          {podeCriarOrcamento ? (
            <DropdownMenuItem onClick={onAbrirOrcamento}>
              <FilePlus2 className="size-4" />
              Montar orçamento
            </DropdownMenuItem>
          ) : null}
          {podeOrcamento ? (
            <DropdownMenuItem onClick={() => setEnviandoOrcamento(true)}>
              <FileText className="size-4" />
              Enviar orçamento (PDF)
            </DropdownMenuItem>
          ) : null}
          {podeAgendar ? (
            <DropdownMenuItem onClick={() => setAgendando(true)}>
              <CalendarPlus className="size-4" />
              Agendar visita/retorno
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AgendarDialog
        conversaId={conversaId}
        aberto={agendando}
        onOpenChange={setAgendando}
      />

      <OrcamentoDialog
        conversaId={conversaId}
        aberto={enviandoOrcamento}
        onOpenChange={setEnviandoOrcamento}
      />
    </>
  );
}

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

/**
 * Escolha do orçamento a mandar para o cliente.
 *
 * A lista é a do próprio módulo de orçamentos, já filtrada pelo cliente da
 * conversa — o vendedor não digita id nem escolhe cliente aqui. O PDF é montado
 * no servidor no momento do envio (o mesmo arquivo que a tela de orçamento
 * baixa), então a proposta que chega ao cliente reflete o orçamento como está
 * agora, não uma cópia velha.
 */
function OrcamentoDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");

  const orcamentosQuery = useQuery({
    queryKey: ["whatsapp-orcamentos", conversaId],
    queryFn: () =>
      apiFetch<{ data: Orcamento[] }>(
        `/whatsapp/conversas/${conversaId}/acoes/orcamentos`,
      ),
    enabled: aberto,
  });
  const orcamentos = orcamentosQuery.data?.data ?? [];

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/acoes/orcamento`, {
        method: "POST",
        body: { orcamentoId: escolhido, legenda: legenda.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Proposta enviada para o cliente");
      setEscolhido(null);
      setLegenda("");
      onOpenChange(false);
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
      // A emissão entra no histórico do orçamento/cliente como atividade.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar a proposta"),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar orçamento em PDF</DialogTitle>
          <DialogDescription>
            A proposta é gerada agora e vai como anexo na conversa. Orçamento
            com desconto acima do máximo da regra precisa estar autorizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {orcamentosQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando orçamentos…</p>
          ) : orcamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este cliente não tem orçamento cadastrado.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {orcamentos.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setEscolhido(o.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    escolhido === o.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      Nº {o.numero} — {o.titulo}
                    </span>
                    <span className="shrink-0 tabular-nums">{moeda(o.vlrTotal)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dataBr(o.createdAt)} · {STATUS_ORCAMENTO_LABEL[o.status]}
                  </div>
                </button>
              ))}
            </div>
          )}

          <Textarea
            placeholder="Mensagem que acompanha o arquivo (opcional)"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            onClick={() => enviar.mutate()}
            disabled={!escolhido || enviar.isPending}
          >
            {enviar.isPending ? "Enviando…" : "Enviar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Posição do cliente sem sair da conversa.
 *
 * Consulta, não mensagem: **nada disso vai para o cliente**. É o que o
 * vendedor precisa ter na frente enquanto conversa — quanto o cliente já
 * comprou, o que está vencido, o que ele costuma levar. Os dados são os
 * mesmos da tela de Posição de Cliente, pela mesma rota.
 */
function AgendarDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quando, setQuando] = useState("");

  const agendar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/acoes/agendar`, {
        method: "POST",
        body: {
          tipo: "visita",
          titulo,
          descricao: descricao || undefined,
          dataVencimento: quando ? new Date(quando).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Agendado na sua agenda de atividades");
      setTitulo("");
      setDescricao("");
      setQuando("");
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao agendar"),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar visita ou retorno</DialogTitle>
          <DialogDescription>
            Fica na sua agenda de atividades, ligada a este cliente. O cliente
            não recebe mensagem por isso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="O que será feito (ex.: Levar amostra)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
          <Textarea
            placeholder="Observações (opcional)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => agendar.mutate()}
            disabled={!titulo.trim() || agendar.isPending}
          >
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
