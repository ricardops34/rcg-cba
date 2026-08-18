"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, MessageCircle, MessageSquarePlus, Plug } from "lucide-react";
import { toast } from "sonner";
import type {
  WhatsappConversa,
  WhatsappMensagem,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConexaoSheet } from "@/components/whatsapp/conexao-sheet";
import { NovaConversaDialog } from "@/components/whatsapp/nova-conversa-dialog";
import { Composer } from "@/components/whatsapp/composer";
import { MensagemBolha } from "@/components/whatsapp/mensagem-bolha";
import { AcoesCliente } from "@/components/whatsapp/acoes-cliente";

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
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
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

  const conversaSelecionada =
    conversas?.itens.find((c) => c.id === conversaId) ?? null;

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
        <div className="flex items-center gap-2">
          <Button onClick={() => setNovaConversaAberta(true)}>
            <MessageSquarePlus className="size-4" />
            Nova conversa
          </Button>
          <Button variant="outline" onClick={() => setConexaoAberta(true)}>
            <Plug className="size-4" />
            {sessao.numero ?? "Conexão"}
          </Button>
        </div>
      </div>

      <div className="grid h-[calc(100vh-14rem)] grid-cols-1 gap-3 md:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_18rem]">
        <ListaDeConversas
          carregando={carregandoConversas}
          conversas={conversas?.itens ?? []}
          selecionada={conversaId}
          onSelecionar={setConversaId}
        />
        <Conversa
          conversaId={conversaId}
          temCliente={Boolean(conversaSelecionada?.clienteId)}
        />
        <PainelCliente conversa={conversaSelecionada ?? null} />
      </div>

      <ConexaoSheet
        aberto={conexaoAberta}
        onOpenChange={setConexaoAberta}
        sessao={sessao}
      />
      <NovaConversaDialog
        aberto={novaConversaAberta}
        onOpenChange={setNovaConversaAberta}
        onAbrirConversa={setConversaId}
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
          </button>
        ))
      )}
    </div>
  );
}

function Conversa({
  conversaId,
  temCliente,
}: {
  conversaId: string | null;
  temCliente: boolean;
}) {
  const queryClient = useQueryClient();
  const [respondendo, setRespondendo] = useState<WhatsappMensagem | null>(null);
  const fimDoRolo = useRef<HTMLDivElement>(null);

  const { data: mensagens } = useQuery({
    queryKey: ["whatsapp-mensagens", conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(`/whatsapp/conversas/${conversaId}/mensagens`),
    enabled: !!conversaId,
    refetchInterval: 8000,
  });

  // Conversa abre no fim, como em qualquer mensageiro — e desce a cada
  // mensagem nova em vez de deixar o vendedor rolando atrás dela.
  useEffect(() => {
    fimDoRolo.current?.scrollIntoView({ block: "end" });
  }, [mensagens?.length, conversaId]);

  // Trocar de conversa não pode manter a citação da anterior pendurada.
  useEffect(() => setRespondendo(null), [conversaId]);

  // Abrir a conversa é o que a marca como lida — aqui e no celular do
  // vendedor, que recebe o recibo de leitura.
  useEffect(() => {
    if (!conversaId) return;
    void apiFetch(`/whatsapp/conversas/${conversaId}/lida`, { method: "POST" })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      )
      .catch(() => undefined);
  }, [conversaId, queryClient]);

  if (!conversaId) {
    return (
      <div className="flex items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Escolha uma conversa
      </div>
    );
  }

  const porExternoId = new Map(
    (mensagens ?? []).map((m) => [m.externoId, m] as const),
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(mensagens ?? []).map((m) => (
          <MensagemBolha
            key={m.id}
            mensagem={m}
            conversaId={conversaId}
            citada={m.respondeuA ? (porExternoId.get(m.respondeuA) ?? null) : null}
            onResponder={setRespondendo}
          />
        ))}
        <div ref={fimDoRolo} />
      </div>

      <div className="flex items-end">
        {temCliente ? (
          <div className="pb-3 pl-2">
            <AcoesCliente conversaId={conversaId} />
          </div>
        ) : null}
        <div className="flex-1">
          <Composer
            conversaId={conversaId}
            respondendo={respondendo}
            onCancelarResposta={() => setRespondendo(null)}
          />
        </div>
      </div>
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
        <VincularCliente conversa={conversa} />
      )}
      <div>
        <p className="text-xs text-muted-foreground">Atendente</p>
        <p>{conversa.vendedorNome}</p>
      </div>
    </div>
  );
}

/**
 * Vínculo do contato com um cliente da carteira.
 *
 * É o que **autoriza a gravação**: sem cliente vinculado, o que o contato
 * escreve não é guardado (a conversa aparece na lista, o conteúdo não fica) e
 * as ações do sistema não têm com quem trabalhar. Até aqui a rota existia
 * (`PUT /whatsapp/conversas/:id/vinculo`), mas nenhuma tela a chamava: só dava
 * para vincular ao **iniciar** a conversa por um cliente, e conversa que chegou
 * pelo aparelho ficava sem saída.
 *
 * Gravação retroativa não acontece: o que passou antes do vínculo não volta —
 * daí o aviso na tela, para o vendedor não esperar o histórico aparecer.
 */
function VincularCliente({ conversa }: { conversa: WhatsappConversa }) {
  const queryClient = useQueryClient();
  const [clienteId, setClienteId] = useState<string | null>(null);

  const vincular = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/vinculo`, {
        method: "PUT",
        body: { clienteId, ignorar: false },
      }),
    onSuccess: () => {
      toast.success("Contato vinculado — as próximas mensagens ficam gravadas");
      setClienteId(null);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao vincular"),
  });

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div>
        <p className="text-xs font-medium">Sem cliente vinculado</p>
        <p className="text-xs text-muted-foreground">
          Enquanto não houver vínculo, as mensagens deste contato não são
          gravadas e as ações do sistema ficam indisponíveis. O que já passou
          não volta.
        </p>
      </div>
      <ClienteCombobox value={clienteId} onChange={setClienteId} />
      <Button
        size="sm"
        className="w-full"
        disabled={!clienteId || vincular.isPending}
        onClick={() => vincular.mutate()}
      >
        <Link2 className="size-4" />
        {vincular.isPending ? "Vinculando…" : "Vincular ao cliente"}
      </Button>
    </div>
  );
}
