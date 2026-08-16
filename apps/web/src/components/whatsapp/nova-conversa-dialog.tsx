"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquarePlus, RefreshCw, Search } from "lucide-react";
import type {
  WhatsappContatoAgenda,
  WhatsappConversa,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";

/**
 * Começar uma conversa sem esperar o cliente escrever.
 *
 * Três caminhos, porque são três situações reais do vendedor: o contato já
 * está na agenda do celular dele, a conversa já existe no aparelho, ou ele
 * quer falar com um cliente da carteira e o número vem do cadastro.
 *
 * A agenda é lida do aparelho na hora e **não** fica gravada na plataforma —
 * só entra no banco o contato que virar conversa.
 */
export function NovaConversaDialog({
  aberto,
  onOpenChange,
  onAbrirConversa,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onAbrirConversa: (conversaId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");

  const contatos = useQuery({
    queryKey: ["whatsapp-agenda-contatos", busca],
    queryFn: () =>
      apiFetch<WhatsappContatoAgenda[]>("/whatsapp/agenda/contatos", {
        query: { busca: busca || undefined },
      }),
    enabled: aberto,
  });

  const conversasAparelho = useQuery({
    queryKey: ["whatsapp-agenda-conversas"],
    queryFn: () =>
      apiFetch<WhatsappContatoAgenda[]>("/whatsapp/agenda/conversas"),
    enabled: aberto,
  });

  const iniciar = useMutation({
    mutationFn: (corpo: {
      jid?: string;
      clienteId?: string;
      telefone?: string;
      nome?: string;
    }) =>
      apiFetch<WhatsappConversa>("/whatsapp/conversas", {
        method: "POST",
        body: corpo,
      }),
    onSuccess: (conversa) => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      onAbrirConversa(conversa.id);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível abrir a conversa",
      ),
  });

  const sincronizar = useMutation({
    mutationFn: () =>
      apiFetch("/whatsapp/agenda/sincronizar", { method: "POST" }),
    onSuccess: () => {
      toast.success("Pedido enviado — a agenda atualiza em alguns segundos.");
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-agenda-contatos"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-agenda-conversas"],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao atualizar a agenda",
      ),
  });

  const abrirDaAgenda = (contato: WhatsappContatoAgenda) => {
    if (contato.conversaId) {
      onAbrirConversa(contato.conversaId);
      onOpenChange(false);
      return;
    }
    iniciar.mutate({
      jid: contato.jid,
      nome: contato.nome ?? undefined,
      // Telefone que aponta para um cliente só já nasce vinculado — é o mesmo
      // critério do casamento automático de quem escreve primeiro. Com dois
      // candidatos não há sugestão, e o vínculo fica para o vendedor fazer.
      clienteId: contato.sugestaoClienteId ?? undefined,
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            Escolha na agenda do seu celular ou pela sua carteira de clientes.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="agenda">
          <TabsList className="w-full">
            <TabsTrigger value="agenda" className="flex-1">
              Agenda
            </TabsTrigger>
            <TabsTrigger value="aparelho" className="flex-1">
              Conversas do celular
            </TabsTrigger>
            <TabsTrigger value="cliente" className="flex-1">
              Meus clientes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-8"
                  placeholder="Buscar na agenda por nome ou número"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                title="Atualizar a agenda a partir do celular"
                onClick={() => sincronizar.mutate()}
                disabled={sincronizar.isPending}
              >
                <RefreshCw
                  className={`size-4 ${sincronizar.isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <ListaDeContatos
              carregando={contatos.isLoading}
              contatos={contatos.data ?? []}
              vazio="Nenhum contato na agenda. Use o botão de atualizar para buscar do celular."
              onEscolher={abrirDaAgenda}
              desabilitado={iniciar.isPending}
            />
          </TabsContent>

          <TabsContent value="aparelho">
            <ListaDeContatos
              carregando={conversasAparelho.isLoading}
              contatos={conversasAparelho.data ?? []}
              vazio="Nenhuma conversa veio do celular. Elas chegam junto com o histórico, na primeira conexão do aparelho."
              onEscolher={abrirDaAgenda}
              desabilitado={iniciar.isPending}
            />
          </TabsContent>

          <TabsContent value="cliente" className="space-y-3">
            <ClienteCombobox value={clienteId} onChange={setClienteId} />
            <Input
              placeholder="Número com DDD (opcional)"
              inputMode="numeric"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Em branco, usa o telefone do cadastro (o celular, se houver).
              Muitos cadastros estão sem DDD — nesse caso informe o número aqui
              ou defina o DDD padrão em Administração &gt; WhatsApp.
            </p>
            <Button
              className="w-full"
              disabled={!clienteId || iniciar.isPending}
              onClick={() =>
                clienteId &&
                iniciar.mutate({
                  clienteId,
                  telefone: telefone.trim() || undefined,
                })
              }
            >
              <MessageSquarePlus className="size-4" />
              Abrir conversa
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ListaDeContatos({
  carregando,
  contatos,
  vazio,
  onEscolher,
  desabilitado,
}: {
  carregando: boolean;
  contatos: WhatsappContatoAgenda[];
  vazio: string;
  onEscolher: (contato: WhatsappContatoAgenda) => void;
  desabilitado: boolean;
}) {
  if (carregando) return <Skeleton className="h-64 w-full" />;
  if (contatos.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{vazio}</p>;
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      {contatos.map((c) => (
        <button
          key={c.jid}
          type="button"
          disabled={desabilitado}
          onClick={() => onEscolher(c)}
          className="flex w-full items-center justify-between gap-2 border-b p-3 text-left transition last:border-b-0 hover:bg-muted/50 disabled:opacity-50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {c.nome ?? c.telefone ?? c.jid}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {c.telefone ?? "—"}
              {c.clienteRazaoSocial ? ` · ${c.clienteRazaoSocial}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {c.naoLidas > 0 ? <Badge>{c.naoLidas}</Badge> : null}
            {c.clienteId ? (
              <Badge variant="secondary">Cliente</Badge>
            ) : c.sugestaoClienteNome ? (
              // Sugestão, não vínculo: o nome aparece para o vendedor conferir
              // antes de a conversa começar.
              <Badge variant="outline" title={c.sugestaoClienteNome}>
                {c.sugestaoClienteNome.slice(0, 18)}
              </Badge>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}
