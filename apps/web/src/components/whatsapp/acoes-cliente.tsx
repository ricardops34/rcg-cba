"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarPlus,
  FileSpreadsheet,
  Receipt,
  Wrench,
} from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
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
export function AcoesCliente({ conversaId }: { conversaId: string }) {
  const queryClient = useQueryClient();
  const [agendando, setAgendando] = useState(false);
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
  if (!podeTitulos && !podeNotas && !podeAgendar) return null;

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
    </>
  );
}

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
