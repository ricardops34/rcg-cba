"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import type {
  Cliente,
  ClienteContato,
  WhatsappContatoAgenda,
  WhatsappConversa,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useAtendimentoJanelaStore } from "@/stores/atendimento-janela-store";
import { useWhatsappIntegracao } from "@/hooks/use-whatsapp-integracao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Conversa } from "@/components/whatsapp/conversa-painel";
import { ListaDeContatos } from "@/components/whatsapp/nova-conversa-dialog";

const PERMISSAO_VER = "whatsapp-conversas.visualizar";
const PERMISSAO_ENVIAR = "whatsapp-conversas.cadastrar";

/** A instância de WhatsApp do usuário logado — mesma chave da tela de Atendimento. */
export function useMinhaSessao(habilitado: boolean) {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  return useQuery({
    queryKey: ["whatsapp-sessao", empresaId],
    queryFn: () => apiFetch<WhatsappSessao | null>("/whatsapp/sessao"),
    retry: false,
    enabled: !!empresaId && habilitado,
  });
}

/**
 * O atalho "Atendimento" faz sentido aqui?
 *
 * Três condições, todas necessárias: o WhatsApp está ligado na empresa, o
 * perfil vê conversas, e o usuário tem **instância própria** vinculada ao
 * vendedor dele (mesmo desconectada — o histórico ainda se lê). Sem instância
 * a janela só diria "conecte o aparelho", o que é trabalho da tela de
 * Atendimento.
 *
 * Esconder não é autorizar: a API confere carteira e sessão de novo em cada
 * chamada.
 */
export function useAtendimentoDisponivel() {
  const podeVer = useAuthStore(
    (s) => s.user?.permissoes.includes(PERMISSAO_VER) ?? false,
  );
  const { ativo } = useWhatsappIntegracao();
  const sessao = useMinhaSessao(podeVer && ativo === true);
  return podeVer && ativo === true && !!sessao.data;
}

/**
 * Aba "WhatsApp" da janela do assistente: o atendimento de **um** cliente.
 *
 * O cliente chega pela Posição de Cliente (menu da linha › Atendimento), que
 * abre a janela já nesta aba. A janela é montada no shell do app e não é modal
 * (`JanelaFlutuante`): navegar para a Posição 360° ou para o orçamento novo
 * não fecha a conversa.
 *
 * A conversa é sempre a da **instância do próprio usuário**, como na tela de
 * Atendimento. Um supervisor que abre um cliente da equipe não lê aqui a
 * conversa do vendedor — isso é o Histórico do WhatsApp, só leitura.
 */
export function AbaWhatsapp() {
  const cliente = useAtendimentoJanelaStore((s) => s.cliente);

  if (!cliente) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-[#00A884]">
          <MessageCircle className="size-6" />
        </div>
        <p className="font-semibold">Nenhum cliente em atendimento</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Abra pela Posição de Cliente, no menu da linha › Atendimento. Para ver
          todas as conversas, use a tela de Atendimento.
        </p>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/comercial/atendimento" target="_blank" rel="noopener">
            <ExternalLink className="size-3.5" /> Abrir Atendimento
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <ConteudoAtendimento
      key={`${cliente.id}:${cliente.conversaId ?? ""}`}
      clienteId={cliente.id}
      conversaId={cliente.conversaId ?? null}
    />
  );
}

function ConteudoAtendimento({
  clienteId,
  conversaId,
}: {
  clienteId: string;
  /** Conversa indicada por quem abriu; sem ela, a mais recente do cliente. */
  conversaId: string | null;
}) {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const podeEnviar = useAuthStore(
    (s) => s.user?.permissoes.includes(PERMISSAO_ENVIAR) ?? false,
  );
  const sessao = useMinhaSessao(true);
  const sessaoId = sessao.data?.id ?? null;

  // A chave começa por "whatsapp-conversas" de propósito: o que invalida a
  // lista do Atendimento (enviar, vincular, ler) atualiza esta também.
  const conversas = useQuery({
    queryKey: ["whatsapp-conversas", empresaId, "cliente", clienteId, sessaoId],
    queryFn: () =>
      apiFetch<{ total: number; itens: WhatsappConversa[] }>(
        "/whatsapp/conversas",
        { query: { sessaoId: sessaoId ?? undefined, clienteId, tamanho: 1 } },
      ),
    enabled: !!empresaId && !!sessaoId && !conversaId,
  });
  // A conversa indicada vem pelo id, com a mesma chave da tela de Atendimento.
  // A API só a entrega se for da instância do próprio usuário.
  const indicada = useQuery({
    queryKey: ["whatsapp-conversa", empresaId, conversaId],
    queryFn: () => apiFetch<WhatsappConversa>(`/whatsapp/conversas/${conversaId}`),
    enabled: !!empresaId && !!sessaoId && !!conversaId,
  });
  const busca = conversaId ? indicada : conversas;

  if (sessao.isLoading || (sessaoId && busca.isLoading)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#00A884]" />
      </div>
    );
  }

  if (!sessao.data) {
    return (
      <Aviso
        titulo="Seu WhatsApp não está conectado"
        texto="Conecte o aparelho na tela de Atendimento para conversar com seus clientes por aqui."
      />
    );
  }

  if (busca.error) {
    return (
      <Aviso
        titulo="Não foi possível buscar a conversa"
        texto={
          busca.error instanceof ApiError
            ? busca.error.message
            : "Tente novamente em instantes."
        }
      />
    );
  }

  const conversa = conversaId
    ? (indicada.data ?? null)
    : (conversas.data?.itens[0] ?? null);
  const conectada = sessao.data.status === "conectada";

  if (!conversa) {
    return (
      <VincularWhatsapp
        clienteId={clienteId}
        conectada={conectada}
        podeEnviar={podeEnviar}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <Conversa
        conversaId={conversa.id}
        conversa={conversa}
        clienteId={clienteId}
        somenteConsulta={
          !conectada
            ? { vendedorNome: sessao.data.vendedorNome, motivo: "desconectado" }
            : !podeEnviar
              ? { vendedorNome: sessao.data.vendedorNome, motivo: "sem-permissao" }
              : null
        }
        // Sem contato, posição e orçamento: a janela abre por cima da Posição de
        // Cliente, que já tem os três, e nada aqui deve tirar o vendedor dela.
      />
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
        <TriangleAlert className="size-6" />
      </div>
      <p className="font-semibold">{titulo}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href="/comercial/atendimento" target="_blank" rel="noopener">
          <ExternalLink className="size-3.5" /> Abrir Atendimento
        </Link>
      </Button>
    </div>
  );
}

/**
 * O cliente ainda não tem conversa na instância do usuário: vincular um
 * WhatsApp a ele.
 *
 * Três origens, as mesmas da "Nova conversa" do Atendimento, mas com o
 * cliente já fixo: o telefone do cadastro (ou um digitado), um contato da
 * agenda do celular, ou uma conversa que já veio do aparelho. Todas passam
 * por `POST /whatsapp/conversas` com o `clienteId` — é a API que confere a
 * carteira e grava o vínculo.
 */
// Sentinelas do seletor de pessoa: o Radix não aceita item com valor vazio.
const SEM_PESSOA = "__sem__";
const NOVA_PESSOA = "__nova__";

function VincularWhatsapp({
  clienteId,
  conectada,
  podeEnviar,
}: {
  clienteId: string;
  conectada: boolean;
  podeEnviar: boolean;
}) {
  const queryClient = useQueryClient();
  const [telefone, setTelefone] = useState("");
  const [busca, setBusca] = useState("");
  /** Contato já ligado a outro cliente: trocar o vínculo pede confirmação. */
  const [troca, setTroca] = useState<WhatsappContatoAgenda | null>(null);
  const liberado = conectada && podeEnviar;
  const podeCadastrarPessoa = useAuthStore(
    (s) => s.user?.permissoes.includes("clientes.editar") ?? false,
  );

  // A pessoa do cadastro que atende neste número. É o que "atualiza o
  // cadastro": a API liga o número a ela e o grava como celular dela quando
  // estava sem. O telefone do **cliente** não muda — ele vem do ERP.
  const pessoas = useQuery({
    queryKey: ["cliente-contatos", clienteId],
    queryFn: () => apiFetch<ClienteContato[]>(`/clientes/${clienteId}/contatos`),
    enabled: liberado,
  });
  const ativas = (pessoas.data ?? []).filter((p) => p.ativo);
  // Sugestão: a pessoa principal, ou a única; sem ninguém cadastrado, abre o
  // cadastro de uma nova (quando o perfil pode). O vendedor troca à vontade.
  const pessoaSugerida =
    ativas.find((p) => p.principal)?.id ??
    (ativas.length === 1 ? ativas[0].id : null) ??
    (ativas.length === 0 && podeCadastrarPessoa ? NOVA_PESSOA : SEM_PESSOA);
  const [pessoaEscolhida, setPessoa] = useState<string | null>(null);
  const pessoaId = pessoaEscolhida ?? pessoaSugerida;
  const [novaNome, setNovaNome] = useState("");
  const [novaEmail, setNovaEmail] = useState("");
  const novaIncompleta =
    pessoaId === NOVA_PESSOA &&
    (novaNome.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(novaEmail.trim()));

  // Os números do cadastro, na ordem em que a API escolhe quando o campo fica
  // em branco (`iniciarConversa`): celular primeiro, que é o que costuma ter
  // WhatsApp. Mesma chave do `ClienteCombobox`, que já busca este cliente.
  const cadastro = useQuery({
    queryKey: ["clientes", clienteId],
    queryFn: () => apiFetch<Cliente>(`/clientes/${clienteId}`),
    enabled: liberado,
  });
  const numerosCadastro = [
    { rotulo: "Celular", numero: cadastro.data?.celular },
    { rotulo: "Telefone", numero: cadastro.data?.telefone },
    { rotulo: "Telefone 2", numero: cadastro.data?.telefone2 },
  ].filter(
    // Mesmo corte do `primeiroTelefoneValido` da API: 8 dígitos é o mínimo de
    // um número local (a base guarda muitos telefones sem DDD).
    (n): n is { rotulo: string; numero: string } =>
      !!n.numero && n.numero.replace(/\D/g, "").length >= 8,
  );
  // Campo em branco = o primeiro número do cadastro, então é ele que aparece
  // marcado até o vendedor escolher ou digitar outro.
  const numeroMarcado = telefone.trim() || numerosCadastro[0]?.numero || "";

  const contatos = useQuery({
    queryKey: ["whatsapp-agenda-contatos", busca],
    queryFn: () =>
      apiFetch<WhatsappContatoAgenda[]>("/whatsapp/agenda/contatos", {
        query: { busca: busca || undefined },
      }),
    enabled: liberado,
  });
  const conversasAparelho = useQuery({
    queryKey: ["whatsapp-agenda-conversas"],
    queryFn: () =>
      apiFetch<WhatsappContatoAgenda[]>("/whatsapp/agenda/conversas"),
    enabled: liberado,
  });

  const iniciar = useMutation({
    mutationFn: async (corpo: { jid?: string; telefone?: string; nome?: string }) => {
      let clienteContatoId: string | undefined =
        pessoaId === SEM_PESSOA || pessoaId === NOVA_PESSOA ? undefined : pessoaId;
      if (pessoaId === NOVA_PESSOA) {
        // Sem celular: quem grava o número é a API, já no formato do WhatsApp.
        const criada = await apiFetch<ClienteContato>(`/clientes/${clienteId}/contatos`, {
          method: "POST",
          body: { nome: novaNome.trim(), email: novaEmail.trim(), principal: false },
        });
        clienteContatoId = criada.id;
      }
      return apiFetch<WhatsappConversa>("/whatsapp/conversas", {
        method: "POST",
        body: { ...corpo, clienteId, clienteContatoId },
      });
    },
    onSuccess: () => {
      setTroca(null);
      toast.success(
        pessoaId === SEM_PESSOA
          ? "WhatsApp vinculado ao cliente"
          : "WhatsApp vinculado ao cliente e ao contato do cadastro",
      );
      void queryClient.invalidateQueries({ queryKey: ["cliente-contatos", clienteId] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-agenda-contatos"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-agenda-conversas"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível vincular o WhatsApp",
      ),
  });

  const escolher = (c: WhatsappContatoAgenda) => {
    if (c.clienteId && c.clienteId !== clienteId) {
      setTroca(c);
      return;
    }
    iniciar.mutate({ jid: c.jid, nome: c.nome ?? undefined });
  };

  if (!conectada) {
    return (
      <Aviso
        titulo="Nenhuma conversa com este cliente"
        texto="Seu WhatsApp está desconectado. Reconecte o aparelho na tela de Atendimento para vincular um número a este cliente."
      />
    );
  }
  if (!podeEnviar) {
    return (
      <Aviso
        titulo="Nenhuma conversa com este cliente"
        texto="Seu perfil não tem permissão para iniciar conversas pelo WhatsApp. Peça ao administrador."
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <div>
        <p className="font-semibold">Vincular WhatsApp</p>
        <p className="text-sm text-muted-foreground">
          Este cliente ainda não tem conversa no seu WhatsApp. Escolha o número
          para iniciar o atendimento — o contato fica vinculado ao cliente.
        </p>
      </div>

      {troca ? (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p>
            <span className="font-medium">{troca.nome ?? troca.telefone}</span>{" "}
            está vinculado a{" "}
            <span className="font-medium">{troca.clienteRazaoSocial ?? "outro cliente"}</span>.
            Vincular a este cliente troca o vínculo do contato.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={iniciar.isPending || novaIncompleta}
              onClick={() =>
                iniciar.mutate({ jid: troca.jid, nome: troca.nome ?? undefined })
              }
            >
              Trocar vínculo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTroca(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <p className="text-xs font-medium">Contato do cadastro que atende neste número</p>
        <Select value={pessoaId} onValueChange={setPessoa}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ativas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
                {p.celular ? ` · ${p.celular}` : " · sem celular"}
              </SelectItem>
            ))}
            {podeCadastrarPessoa ? (
              <SelectItem value={NOVA_PESSOA}>Cadastrar novo contato</SelectItem>
            ) : null}
            <SelectItem value={SEM_PESSOA}>Não ligar a um contato</SelectItem>
          </SelectContent>
        </Select>
        {pessoaId === NOVA_PESSOA ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Nome"
              value={novaNome}
              onChange={(e) => setNovaNome(e.target.value)}
            />
            <Input
              placeholder="E-mail"
              type="email"
              value={novaEmail}
              onChange={(e) => setNovaEmail(e.target.value)}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {pessoaId === SEM_PESSOA
            ? "O número fica vinculado só ao cliente."
            : "O número entra no cadastro como celular do contato, se ele ainda não tiver um."}
        </p>
      </div>

      <Tabs defaultValue="cadastro">
        <TabsList className="w-full">
          <TabsTrigger value="cadastro" className="flex-1">
            Cadastro
          </TabsTrigger>
          <TabsTrigger value="agenda" className="flex-1">
            Agenda
          </TabsTrigger>
          <TabsTrigger value="aparelho" className="flex-1">
            Conversas do celular
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="space-y-3">
          {cadastro.isLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : numerosCadastro.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Números do cadastro
              </p>
              {numerosCadastro.map((n) => {
                const marcado = n.numero === numeroMarcado;
                return (
                  <button
                    key={n.rotulo}
                    type="button"
                    onClick={() => setTelefone(n.numero)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      marcado
                        ? "border-[#00A884] bg-emerald-500/10"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{n.numero}</span>
                    <span className="text-xs text-muted-foreground">{n.rotulo}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-amber-600">
              O cliente não tem telefone no cadastro. Informe o número abaixo.
            </p>
          )}
          <Input
            placeholder={
              numerosCadastro.length > 0
                ? "Outro número com DDD (opcional)"
                : "Número com DDD"
            }
            inputMode="numeric"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
          {numerosCadastro.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Em branco, usa o número marcado do cadastro.
            </p>
          ) : null}
          <Button
            className="w-full gap-2 bg-[#00A884] text-white hover:bg-[#008f6f]"
            disabled={iniciar.isPending || novaIncompleta}
            onClick={() => iniciar.mutate({ telefone: telefone.trim() || undefined })}
          >
            <MessageSquarePlus className="size-4" />
            Iniciar atendimento
          </Button>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar na agenda por nome ou número"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <ListaDeContatos
            carregando={contatos.isLoading}
            contatos={contatos.data ?? []}
            vazio="Nenhum contato na agenda. Atualize a agenda pela Nova conversa, na tela de Atendimento."
            onEscolher={escolher}
            desabilitado={iniciar.isPending || novaIncompleta}
          />
        </TabsContent>

        <TabsContent value="aparelho" className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => void conversasAparelho.refetch()}
          >
            <RefreshCw className="size-3.5" /> Atualizar
          </Button>
          <ListaDeContatos
            carregando={conversasAparelho.isLoading}
            contatos={conversasAparelho.data ?? []}
            vazio="Nenhuma conversa veio do celular."
            onEscolher={escolher}
            desabilitado={iniciar.isPending || novaIncompleta}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
