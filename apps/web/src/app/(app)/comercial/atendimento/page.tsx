"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Plug, Send } from "lucide-react";
import type {
  WhatsappConversa,
  WhatsappMensagem,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConexaoSheet } from "@/components/whatsapp/conexao-sheet";

type ListaConversas = {
  total: number;
  itens: WhatsappConversa[];
};

/**
 * Atendimento por WhatsApp — três colunas: conversas, mensagens e o cliente.
 * A conexão do aparelho é um botão daqui, não uma tela à parte.
 */
export default function AtendimentoPage() {
  const [conexaoAberta, setConexaoAberta] = useState(false);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const { data: sessao, isLoading: carregandoSessao } = useQuery({
    queryKey: ["whatsapp-sessao"],
    queryFn: () => apiFetch<WhatsappSessao | null>("/whatsapp/sessao"),
    // Enquanto pareia, o status muda por fora (o celular lê o QR).
    refetchInterval: (q) =>
      q.state.data?.status === "pareando" ? 3000 : false,
  });

  const { data: conversas, isLoading: carregandoConversas } = useQuery({
    queryKey: ["whatsapp-conversas", busca],
    queryFn: () =>
      apiFetch<ListaConversas>(
        `/whatsapp/conversas${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`,
      ),
    refetchInterval: 15000,
  });

  if (carregandoSessao) {
    return <Skeleton className="h-96 w-full" />;
  }

  // Sem sessão, a tela explica em vez de mostrar uma lista vazia sem motivo.
  if (!sessao || sessao.status !== "conectada") {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
          <MessageCircle className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Seu WhatsApp não está conectado</p>
            <p className="text-sm text-muted-foreground">
              Conecte o aparelho para atender seus clientes por aqui. As
              conversas com clientes ficam gravadas na plataforma.
            </p>
          </div>
          <Button onClick={() => setConexaoAberta(true)}>
            <Plug className="size-4" />
            Conectar WhatsApp
          </Button>
        </div>
        <ConexaoSheet
          aberto={conexaoAberta}
          onOpenChange={setConexaoAberta}
          sessao={sessao ?? null}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          placeholder="Buscar por contato, telefone ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-80"
        />
        <Button variant="outline" onClick={() => setConexaoAberta(true)}>
          <Plug className="size-4" />
          {sessao.numero ?? "Conexão"}
        </Button>
      </div>

      <div className="grid h-[calc(100vh-14rem)] grid-cols-1 gap-3 md:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_18rem]">
        <ListaDeConversas
          carregando={carregandoConversas}
          conversas={conversas?.itens ?? []}
          selecionada={conversaId}
          onSelecionar={setConversaId}
        />
        <Conversa conversaId={conversaId} />
        <PainelCliente
          conversa={conversas?.itens.find((c) => c.id === conversaId) ?? null}
        />
      </div>

      <ConexaoSheet
        aberto={conexaoAberta}
        onOpenChange={setConexaoAberta}
        sessao={sessao}
      />
    </>
  );
}

function ListaDeConversas({
  carregando,
  conversas,
  selecionada,
  onSelecionar,
}: {
  carregando: boolean;
  conversas: WhatsappConversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
}) {
  if (carregando) return <Skeleton className="h-full w-full" />;

  return (
    <div className="overflow-y-auto rounded-lg border">
      {conversas.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nenhuma conversa ainda. Elas aparecem aqui quando um cliente escrever.
        </p>
      ) : (
        conversas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelecionar(c.id)}
            className={`flex w-full flex-col gap-1 border-b p-3 text-left transition hover:bg-muted/50 ${
              selecionada === c.id ? "bg-muted" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {c.contato.clienteRazaoSocial ??
                  c.contato.nomeExibicao ??
                  c.contato.telefoneNormalizado}
              </span>
              {c.naoLidas > 0 ? (
                <Badge className="shrink-0">{c.naoLidas}</Badge>
              ) : null}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {c.ultimaMensagemPrevia ?? "—"}
            </span>
            {!c.clienteId ? (
              // A conversa aparece, mas o conteúdo não é gravado até vincular.
              <span className="text-[11px] text-amber-600">
                Sem cliente vinculado — não está sendo gravada
              </span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}

function Conversa({ conversaId }: { conversaId: string | null }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");

  const { data: mensagens } = useQuery({
    queryKey: ["whatsapp-mensagens", conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(`/whatsapp/conversas/${conversaId}/mensagens`),
    enabled: !!conversaId,
    refetchInterval: 8000,
  });

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappMensagem>(`/whatsapp/conversas/${conversaId}/mensagens`, {
        method: "POST",
        body: { texto },
      }),
    onSuccess: () => {
      setTexto("");
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar"),
  });

  if (!conversaId) {
    return (
      <div className="flex items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Escolha uma conversa
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(mensagens ?? []).map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              m.direcao === "saida"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
          >
            {m.conteudo ?? `[${m.tipo}]`}
            <div className="pt-1 text-[10px] opacity-70">
              {new Date(m.criadaEm).toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) enviar.mutate();
        }}
      >
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva a mensagem"
        />
        <Button type="submit" disabled={enviar.isPending || !texto.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function PainelCliente({ conversa }: { conversa: WhatsappConversa | null }) {
  if (!conversa) {
    return <div className="hidden rounded-lg border xl:block" />;
  }
  return (
    <div className="hidden space-y-3 overflow-y-auto rounded-lg border p-4 text-sm xl:block">
      <div>
        <p className="text-xs text-muted-foreground">Contato</p>
        <p className="font-medium">
          {conversa.contato.nomeExibicao ?? conversa.contato.telefoneNormalizado}
        </p>
      </div>
      {conversa.contato.clienteRazaoSocial ? (
        <div>
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p className="font-medium">{conversa.contato.clienteRazaoSocial}</p>
          <p className="text-xs text-muted-foreground">
            Código {conversa.contato.clienteCodigoErp ?? "—"}
          </p>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40">
          Este contato não está vinculado a um cliente, então a conversa não é
          gravada. Vincule para começar a registrar o atendimento.
        </p>
      )}
      <div>
        <p className="text-xs text-muted-foreground">Atendente</p>
        <p>{conversa.vendedorNome}</p>
      </div>
    </div>
  );
}
