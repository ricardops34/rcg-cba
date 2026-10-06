"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, CheckCircle2, History, MoreHorizontal, RefreshCw, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { type WhatsappConfig, type WhatsappSessao } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { InstitucionalConfig } from "@/components/whatsapp/institucional-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type Aba = "evolution-go" | "instancias" | "atendimento" | "institucional";
const ABAS_VALIDAS: Aba[] = ["evolution-go", "instancias", "atendimento", "institucional"];

const STATUS: Record<WhatsappSessao["status"], { rotulo: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  conectada: { rotulo: "Conectada", variant: "success" },
  pareando: { rotulo: "Pareando", variant: "warning" },
  banida: { rotulo: "Banida", variant: "destructive" },
  desconectada: { rotulo: "Desconectada", variant: "secondary" },
};

export default function WhatsappConfigPage() {
  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config"],
    queryFn: () => apiFetch<WhatsappConfig>("/whatsapp/config"),
  });
  const searchParams = useSearchParams();
  const [aba, setAba] = useState<Aba | null>(null);

  if (isLoading || !config) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const abaDoLink = searchParams.get("aba");
  const abaAtual =
    aba ??
    (abaDoLink && ABAS_VALIDAS.includes(abaDoLink as Aba)
      ? (abaDoLink as Aba)
      : "evolution-go");

  return (
    <div className="space-y-6">
      <ChannelHeader config={config} />
      <Tabs value={abaAtual} onValueChange={(value) => setAba(value as Aba)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-2xl">
          <TabsTrigger value="evolution-go">Gateway Evolution GO</TabsTrigger>
          <TabsTrigger value="instancias">Instâncias</TabsTrigger>
          <TabsTrigger value="atendimento">Atendimento IA</TabsTrigger>
          <TabsTrigger value="institucional">Institucional</TabsTrigger>
        </TabsList>
        <TabsContent value="evolution-go" className="pt-4"><EvolutionConfig config={config} /></TabsContent>
        <TabsContent value="instancias" className="pt-4"><Instancias config={config} /></TabsContent>
        <TabsContent value="atendimento" className="pt-4"><AtendimentoIaConfig config={config} /></TabsContent>
        <TabsContent value="institucional" className="pt-4"><InstitucionalConfig /></TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelHeader({ config }: { config: WhatsappConfig }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-400">
          <Cable className="size-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg font-semibold">Central de canais WhatsApp</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Gateway Evolution GO com suporte a integrações Não Oficial (WhatsApp Web) e Oficial (WhatsApp Cloud API Meta), regras da empresa e instâncias.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Gateway: Evolution GO</Badge>
        <Badge variant={config.ativo ? "success" : "secondary"}>
          {config.ativo ? <CheckCircle2 /> : <TriangleAlert />}
          {config.ativo ? "WhatsApp ativo" : "WhatsApp desativado"}
        </Badge>
      </div>
    </div>
  );
}

function EvolutionConfig({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ativo: config.ativo,
    evolutionUrl: config.evolutionUrl ?? "",
    evolutionVersao: config.evolutionVersao ?? "",
    retencaoDias: config.retencaoDias,
    historicoDias: config.historicoDias,
    dddPadrao: config.dddPadrao ?? "",
    evolutionAlwaysOnline: config.evolutionAlwaysOnline,
    evolutionIgnoreGroups: config.evolutionIgnoreGroups,
    evolutionIgnoreStatus: config.evolutionIgnoreStatus,
    evolutionReadMessages: config.evolutionReadMessages,
    evolutionRejectCall: config.evolutionRejectCall,
    evolutionMsgRejectCall: config.evolutionMsgRejectCall ?? "",
  });
  const [chave, setChave] = useState("");

  const salvar = useMutation({
    mutationFn: (opcoes: { apagarChave?: boolean } = {}) =>
      apiFetch<WhatsappConfig>("/whatsapp/config", {
        method: "PUT",
        body: {
          ...form,
          transporte: "evolution_go",
          evolutionUrl: form.evolutionUrl.trim() || null,
          evolutionVersao: form.evolutionVersao.trim() || null,
          dddPadrao: form.dddPadrao.trim() || null,
          evolutionMsgRejectCall: form.evolutionMsgRejectCall.trim() || null,
          ...(opcoes.apagarChave
            ? { evolutionApiKey: "" }
            : chave.trim()
              ? { evolutionApiKey: chave.trim() }
              : {}),
        },
      }),
    onSuccess: (_dados, variaveis) => {
      setChave("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp", "integracao"] });
      toast.success(
        variaveis?.apagarChave
          ? "Chave da Evolution GO removida"
          : "Configuração da Evolution GO salva",
      );
    },
    onError: (error) => toast.error(mensagemErro(error, "Erro ao salvar")),
  });

  const testarConexao = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; mensagem: string; totalInstancias: number }>(
        "/whatsapp/config/testar-gateway",
        {
          method: "POST",
          body: {
            evolutionUrl: form.evolutionUrl.trim() || undefined,
            evolutionApiKey: chave.trim() || undefined,
          },
        },
      ),
    onSuccess: (resultado) => {
      toast.success(
        `${resultado.mensagem} (${resultado.totalInstancias} instância(s) no gateway)`,
      );
    },
    onError: (error) =>
      toast.error(mensagemErro(error, "Falha na conexão com a Evolution GO")),
  });


  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Gateway Evolution GO</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Serviço central que gerencia as conexões de WhatsApp (Não Oficial e Oficial) e entrega os eventos por webhook.
            </p>
          </div>
          <Badge variant={config.ativo ? "default" : "secondary"}>
            {config.ativo ? "Habilitado" : "Desabilitado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <FieldLabel>Habilitar WhatsApp</FieldLabel>
            <FieldDescription>
              Liga o canal de WhatsApp nesta empresa (WHATSAPP_ATIVO). As ações, conversas e o atendimento só funcionam com a integração ligada.
            </FieldDescription>
          </div>
          <Switch
            checked={form.ativo}
            onCheckedChange={(ativo) => setForm((f) => ({ ...f, ativo }))}
          />
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs">
          <div className="flex gap-2 font-medium text-foreground">
            <Cable className="mt-0.5 size-4 shrink-0 text-primary" />
            Integração Unificada com Gateway Evolution GO
          </div>
          <p className="mt-1 pl-6 text-muted-foreground leading-relaxed">
            A Evolution GO suporta duas modalidades de conexão:
            <br />
            • <strong>Não Oficial:</strong> Conexão via WhatsApp Web / Baileys (pareamento por QR Code no aparelho do vendedor ou chip dedicado).
            <br />
            • <strong>Oficial:</strong> Conexão via WhatsApp Cloud API da Meta através do próprio gateway, sem risco de bloqueio de número.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="evolutionUrl">Endereço da Evolution GO</FieldLabel>
              <Input
                id="evolutionUrl"
                value={form.evolutionUrl}
                placeholder="http://rcgcba-evolution-go:8080"
                onChange={(event) =>
                  setForm((f) => ({ ...f, evolutionUrl: event.target.value }))
                }
              />
              <FieldDescription>
                Endereço do gateway Evolution GO: informe o domínio HTTPS (ex.: <code>https://evolutiongo.seudomino.com.br</code>).
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="evolutionApiKey">Chave de API (GLOBAL_API_KEY)</FieldLabel>
              <Input
                id="evolutionApiKey"
                type="password"
                autoComplete="off"
                value={chave}
                placeholder={
                  config.evolutionApiKeyDefinida
                    ? `Chave gravada${config.evolutionApiKeyUltimos4 ? ` (final ${config.evolutionApiKeyUltimos4})` : ""} — preencha só para trocar`
                    : "Cole a chave administrativa do gateway"
                }
                onChange={(event) => setChave(event.target.value)}
              />
              <FieldDescription>
                Guardada cifrada e nunca devolvida pela API. Deixe em branco para manter a atual.
                {config.evolutionApiKeyDefinida ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => salvar.mutate({ apagarChave: true })}
                    >
                      Remover chave gravada
                    </button>
                    .
                  </>
                ) : null}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="evolutionVersao">Versão homologada</FieldLabel>
              <Input
                id="evolutionVersao"
                className="max-w-40"
                placeholder="0.7.2"
                value={form.evolutionVersao}
                onChange={(event) =>
                  setForm((f) => ({ ...f, evolutionVersao: event.target.value }))
                }
              />
              <FieldDescription>
                Registro de qual imagem está no ar. Diferença de versão é a primeira hipótese quando um evento para de chegar.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="dddPadraoEvolution">DDD padrão</FieldLabel>
              <Input
                id="dddPadraoEvolution"
                inputMode="numeric"
                maxLength={2}
                className="max-w-24"
                placeholder="67"
                value={form.dddPadrao}
                onChange={(event) =>
                  setForm((f) => ({ ...f, dddPadrao: event.target.value.replace(/\D/g, "") }))
                }
              />
              <FieldDescription>Usado somente quando o telefone do cliente não possui DDD.</FieldDescription>
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="retencaoDiasEvolution">Retenção das conversas</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="retencaoDiasEvolution"
                  type="number"
                  min={0}
                  max={3650}
                  className="max-w-32"
                  value={form.retencaoDias}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, retencaoDias: Number(event.target.value) }))
                  }
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
              <FieldDescription>Zero mantém indefinidamente. O expurgo automático ainda não foi implementado.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="historicoDiasEvolution">Dias de histórico a importar</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="historicoDiasEvolution"
                  type="number"
                  min={0}
                  max={365}
                  className="max-w-32"
                  value={form.historicoDias}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, historicoDias: Number(event.target.value) }))
                  }
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
              <FieldDescription>
                Acima de zero, a importação é pedida por instância na aba Instâncias e o gateway entrega o histórico aos poucos, por evento. Todas as conversas entram, vinculadas ou não a um cliente.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Comportamento das instâncias</FieldLabel>
              <FieldDescription>
                Vale para todas as instâncias desta empresa: vendedor, gerente, supervisor e o número institucional. A alteração alcança as que já existem na próxima conexão de cada uma.
              </FieldDescription>
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm">
                  <Switch
                    checked={form.evolutionIgnoreGroups}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, evolutionIgnoreGroups: v }))}
                  />
                  <span>
                    Ignorar grupos
                    <span className="block text-xs text-muted-foreground">
                      Grupo não faz parte do atendimento; ignorar na origem evita tráfego que a API descartaria.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Switch
                    checked={form.evolutionIgnoreStatus}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, evolutionIgnoreStatus: v }))}
                  />
                  <span>
                    Ignorar status
                    <span className="block text-xs text-muted-foreground">
                      As publicações de status dos contatos não entram no atendimento.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Switch
                    checked={form.evolutionReadMessages}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, evolutionReadMessages: v }))}
                  />
                  <span>
                    Marcar como lida automaticamente
                    <span className="block text-xs text-muted-foreground">
                      Ligado, manda o visto azul ao cliente sem ninguém ter lido.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Switch
                    checked={form.evolutionAlwaysOnline}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, evolutionAlwaysOnline: v }))}
                  />
                  <span>
                    Sempre online
                    <span className="block text-xs text-muted-foreground">
                      Mostra o número como disponível o tempo todo, inclusive fora do expediente.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Switch
                    checked={form.evolutionRejectCall}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, evolutionRejectCall: v }))}
                  />
                  <span>
                    Recusar chamadas
                    <span className="block text-xs text-muted-foreground">
                      O número não atende ligação: a plataforma é de mensagem.
                    </span>
                  </span>
                </label>
              </div>
            </Field>
            {form.evolutionRejectCall && (
              <Field>
                <FieldLabel htmlFor="evolutionMsgRejectCall">Resposta ao recusar uma chamada</FieldLabel>
                <Input
                  id="evolutionMsgRejectCall"
                  maxLength={500}
                  placeholder="Ex.: Não atendemos por chamada. Me escreva por aqui que eu respondo."
                  value={form.evolutionMsgRejectCall}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, evolutionMsgRejectCall: event.target.value }))
                  }
                />
                <FieldDescription>Em branco, a chamada é recusada sem resposta nenhuma.</FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => testarConexao.mutate()}
          disabled={
            testarConexao.isPending ||
            (!form.evolutionUrl.trim() && !config.evolutionUrl)
          }
        >
          {testarConexao.isPending ? (
            <>
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Testando conexão...
            </>
          ) : (
            <>
              <Cable className="mr-2 size-4" />
              Testar conexão com o Gateway
            </>
          )}
        </Button>
        <Button onClick={() => salvar.mutate({})} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando..." : "Salvar configuração"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function AtendimentoIaConfig({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    atendimentoIaAtivo: config.atendimentoIaAtivo,
    atendimentoSaudacao: config.atendimentoSaudacao ?? "",
    atendimentoInformacoes: config.atendimentoInformacoes ?? "",
    atendimentoInatividadeMin: config.atendimentoInatividadeMin,
  });

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch("/whatsapp/config", {
        method: "PUT",
        body: {
          ...form,
          atendimentoSaudacao: form.atendimentoSaudacao.trim() || null,
          atendimentoInformacoes: form.atendimentoInformacoes.trim() || null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      toast.success("Atendimento por IA atualizado.");
    },
    onError: (error) => toast.error(mensagemErro(error, "Erro ao salvar")),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Atendimento por IA</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              A triagem que atende quem escreve para o número da empresa:
              identifica, responde o que consegue e entrega a conversa a uma
              pessoa.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <Switch
              checked={form.atendimentoIaAtivo}
              onCheckedChange={(atendimentoIaAtivo) =>
                setForm((f) => ({ ...f, atendimentoIaAtivo }))
              }
            />
            Ativo
          </label>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <FieldGroup className="gap-6">
          {!config.ativo && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              A integração de WhatsApp está desativada. Ligar a triagem aqui não
              tem efeito enquanto o número da empresa não estiver conectado.
            </p>
          )}

          <Field>
            <FieldLabel htmlFor="atendimentoSaudacao">Saudação</FieldLabel>
            <Textarea
              id="atendimentoSaudacao"
              rows={2}
              maxLength={500}
              placeholder="Olá! Aqui é o atendimento da Empresa. Como posso ajudar?"
              value={form.atendimentoSaudacao}
              onChange={(event) =>
                setForm((f) => ({ ...f, atendimentoSaudacao: event.target.value }))
              }
            />
            <FieldDescription>
              Primeira fala da conversa, enviada como você escreveu. Não passa
              pela IA de propósito — deixar o modelo compor a saudação faz a
              mesma empresa soar diferente a cada conversa. Em branco, a IA já
              começa respondendo.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="atendimentoInformacoes">
              O que a IA pode dizer sobre a empresa
            </FieldLabel>
            <Textarea
              id="atendimentoInformacoes"
              rows={6}
              maxLength={4000}
              placeholder={
                "Horário: seg a sex, 8h às 18h.\n" +
                "Endereço: Rua X, 100 — Campo Grande/MS.\n" +
                "Pagamento: boleto, PIX e cartão em até 3x.\n" +
                "Prazo de entrega na capital: 2 dias úteis."
              }
              value={form.atendimentoInformacoes}
              onChange={(event) =>
                setForm((f) => ({
                  ...f,
                  atendimentoInformacoes: event.target.value,
                }))
              }
            />
            <FieldDescription>
              Vai ao modelo como contexto, em toda conversa. Vazio não quebra
              nada: sem isto a IA identifica e direciona, que é o mínimo — o que
              ela não faz é inventar. Escreva só o que pode ser dito a qualquer
              um que mande mensagem.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="atendimentoInatividadeMin">
              Encerrar por silêncio
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="atendimentoInatividadeMin"
                type="number"
                min={0}
                max={1440}
                className="max-w-32"
                value={form.atendimentoInatividadeMin}
                onChange={(event) =>
                  setForm((f) => ({
                    ...f,
                    atendimentoInatividadeMin: Number(event.target.value),
                  }))
                }
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <FieldDescription>
              Conversa parada no meio da triagem não está com a IA nem com uma
              pessoa — some da vista de todos. Passado este tempo sem resposta do
              cliente, ela é encerrada e sai do limbo. 0 desliga.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>

      <CardFooter className="justify-end border-t">
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando..." : "Salvar atendimento"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Instancias({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [remover, setRemover] = useState<WhatsappSessao | null>(null);
  const [apagar, setApagar] = useState<WhatsappSessao | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ["whatsapp-sessoes"], queryFn: () => apiFetch<WhatsappSessao[]>("/whatsapp/sessoes"), refetchInterval: 10_000 });
  const atualizar = () => { void queryClient.invalidateQueries({ queryKey: ["whatsapp-sessoes"] }); void queryClient.invalidateQueries({ queryKey: ["whatsapp-sessao"] }); };
  const reconectar = useMutation({
    mutationFn: (id: string) => apiFetch(`/whatsapp/config/sessoes/${id}/reconectar`, { method: "POST" }),
    onSuccess: () => { atualizar(); toast.success("Instância enviada para conexão"); },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao reconectar")),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch(`/whatsapp/config/sessoes/${id}`, { method: "DELETE" }),
    onSuccess: () => { setRemover(null); atualizar(); toast.success("Conexão removida"); },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao remover")),
  });
  const apagarInstancia = useMutation({
    mutationFn: (id: string) => apiFetch(`/whatsapp/config/sessoes/${id}/instancia`, { method: "DELETE" }),
    onSuccess: () => { setApagar(null); atualizar(); toast.success("Instância excluída"); },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao excluir")),
  });
  const importar = useMutation({
    mutationFn: (sessao: WhatsappSessao) => apiFetch<{ dias: number; encontradas: number; conversas: number }>(`/whatsapp/config/sessoes/${sessao.id}/historico`, { method: "POST" }),
    onSuccess: (r) => {
      atualizar();
      toast.success(`Sincronização dos últimos ${r.dias} dias pedida ao gateway. As conversas aparecem em Conversas conforme chegam.`);
    },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao importar histórico")),
  });

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Instâncias dos vendedores</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Estado atualizado a cada 10 segundos. A primeira conexão é iniciada pelo vendedor em Conversas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={atualizar}>
                <RefreshCw className="size-4" /> Atualizar
              </Button>
              <Badge variant="outline">{data.length} {data.length === 1 ? "instância" : "instâncias"}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Carregando instâncias...</p> : null}
          {!isLoading && data.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
              <Smartphone className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhuma instância criada</p>
              <p className="mt-1 text-sm text-muted-foreground">O vendedor deve abrir Comercial → Conversas e iniciar o pareamento.</p>
            </div>
          ) : null}
          {data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última conexão</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((sessao) => (
                  <TableRow key={sessao.id}>
                    <TableCell className="font-medium">{sessao.vendedorNome}</TableCell>
                    <TableCell>{sessao.numero ?? "—"}</TableCell>
                    <TableCell>Evolution GO</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[sessao.status].variant}>{STATUS[sessao.status].rotulo}</Badge>
                    </TableCell>
                    <TableCell>{formatarData(sessao.ultimaConexao)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`Ações de ${sessao.vendedorNome}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => reconectar.mutate(sessao.id)} disabled={reconectar.isPending}>
                            <RefreshCw /> {sessao.status === "desconectada" ? "Conectar" : "Reconectar"}
                          </DropdownMenuItem>
                          {config.historicoDias > 0 && sessao.status === "conectada" ? (
                            <DropdownMenuItem onSelect={() => importar.mutate(sessao)} disabled={importar.isPending}>
                              <History /> Importar histórico ({config.historicoDias} dias)
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemover(sessao)}>
                            <Trash2 /> Remover conexão
                          </DropdownMenuItem>
                          {sessao.status === "desconectada" ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setApagar(sessao)}>
                              <Trash2 /> Excluir instância
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(remover)} onOpenChange={(open) => { if (!open) setRemover(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover conexão?</DialogTitle>
            <DialogDescription>
              A sessão de {remover?.vendedorNome} será encerrada e marcada como desconectada. O histórico de conversas será preservado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" disabled={excluir.isPending} onClick={() => remover && excluir.mutate(remover.id)}>
              {excluir.isPending ? "Removendo..." : "Remover conexão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(apagar)} onOpenChange={(open) => { if (!open) setApagar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir a instância de {apagar?.vendedorNome}?</DialogTitle>
            <DialogDescription>
              A linha some da lista. Só é possível com a instância desconectada e sem conversas no histórico. O vendedor pode parear de novo depois, pela tela de Atendimento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" disabled={apagarInstancia.isPending} onClick={() => apagar && apagarInstancia.mutate(apagar.id)}>
              {apagarInstancia.isPending ? "Excluindo..." : "Excluir instância"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatarData(valor: string | null) {
  return valor ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor)) : "—";
}

function mensagemErro(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
