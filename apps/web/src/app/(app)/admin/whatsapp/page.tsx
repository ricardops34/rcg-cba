"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, CheckCircle2, Cloud, Eraser, ExternalLink, History, MoreHorizontal, RefreshCw, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { WHATSAPP_AVISO_NAO_OFICIAL, WHATSAPP_TRANSPORTE_ROTULO, type WhatsappConfig, type WhatsappSessao } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
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

type Aba = "zapo" | "evolution-go" | "cloud-api" | "instancias" | "atendimento";

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
  // A aba abre no provedor que a empresa usa hoje — quem entra aqui quase
  // sempre vem mexer no que está no ar, não no que ainda não foi escolhido.
  const [aba, setAba] = useState<Aba | null>(null);
  if (isLoading || !config) return <p className="text-sm text-muted-foreground">Carregando central de WhatsApp...</p>;
  const abaAtual = aba ?? (config.transporte === "evolution_go" ? "evolution-go" : config.transporte === "cloud_api" ? "cloud-api" : "zapo");

  return (
    <div className="space-y-5">
      <ChannelHeader config={config} />
      <Tabs value={abaAtual} onValueChange={(value) => setAba(value as Aba)}>
        <TabsList>
          <TabsTrigger value="zapo">zapo-js</TabsTrigger>
          <TabsTrigger value="evolution-go">Evolution GO</TabsTrigger>
          <TabsTrigger value="cloud-api">API Oficial</TabsTrigger>
          <TabsTrigger value="instancias">Instâncias</TabsTrigger>
          <TabsTrigger value="atendimento">Atendimento IA</TabsTrigger>
        </TabsList>
        <TabsContent value="zapo" className="pt-4"><ZapoConfig config={config} /></TabsContent>
        <TabsContent value="evolution-go" className="pt-4"><EvolutionConfig config={config} /></TabsContent>
        <TabsContent value="cloud-api" className="pt-4">
          <ProviderEmPreparacao
            icon={Cloud}
            titulo="API Oficial da Meta"
            descricao="Canal oficial para números da WhatsApp Business Platform."
            detalhes="Ainda faltam o Phone Number ID, token permanente, webhook e fluxo de templates. A opção permanece indisponível para não interromper o atendimento atual."
          />
        </TabsContent>
        <TabsContent value="instancias" className="pt-4"><Instancias config={config} /></TabsContent>
        <TabsContent value="atendimento" className="pt-4"><AtendimentoIaConfig config={config} /></TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Atendimento por IA no número institucional.
 *
 * Fica em aba própria, e não dentro de zapo-js/Evolution GO, porque não é
 * configuração de transporte: vale para o número da empresa qualquer que seja
 * o provedor que o mantém conectado.
 *
 * Estes quatro campos existiam só no banco — a migration os criou, a triagem
 * lia dois deles, e não havia nada que os escrevesse. Enquanto isso, o
 * interruptor nascia desligado e a triagem inteira era inalcançável.
 */
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
              pessoa. Vale para qualquer transporte.
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

function ChannelHeader({ config }: { config: WhatsappConfig }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-400"><Cable className="size-5" /></div>
        <div>
          <h2 className="font-heading text-lg font-semibold">Central de canais WhatsApp</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Escolha o provedor, defina as regras da empresa e acompanhe cada aparelho conectado.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Qual provedor está no ar é a informação que muda o diagnóstico de
            tudo o mais nesta tela — fica ao lado do estado, não escondida na
            aba selecionada. */}
        <Badge variant="outline">Provedor: {WHATSAPP_TRANSPORTE_ROTULO[config.transporte]}</Badge>
        <Badge variant={config.ativo ? "success" : "secondary"}>
          {config.ativo ? <CheckCircle2 /> : <TriangleAlert />}
          {config.ativo ? "WhatsApp ativo" : "WhatsApp desativado"}
        </Badge>
      </div>
    </div>
  );
}

/**
 * Aviso de que salvar esta aba troca o provedor da empresa inteira.
 *
 * A empresa opera um transporte de cada vez, e a troca não é retroativa: as
 * instâncias já pareadas continuam no provedor com que foram conectadas até
 * serem reconectadas. Sem este aviso, o administrador salva a aba achando que
 * mudou tudo e fica com metade do time em cada lado sem saber.
 */
function AvisoTroca({ config, alvo }: { config: WhatsappConfig; alvo: WhatsappConfig["transporte"] }) {
  if (config.transporte === alvo) {
    return <Badge variant="success"><CheckCircle2 /> Provedor em uso</Badge>;
  }
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
      <div className="flex gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Hoje a empresa usa {WHATSAPP_TRANSPORTE_ROTULO[config.transporte]}</div>
      <p className="mt-1 pl-6 opacity-85">
        Salvar aqui passa a empresa para {WHATSAPP_TRANSPORTE_ROTULO[alvo]}. As instâncias já pareadas continuam no
        provedor anterior até serem reconectadas — o vendedor precisa parear de novo para migrar, e o histórico
        de conversas fica onde está.
      </p>
    </div>
  );
}

function ZapoConfig({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ativo: config.ativo, workerUrl: config.workerUrl ?? "", retencaoDias: config.retencaoDias, historicoDias: config.historicoDias, dddPadrao: config.dddPadrao ?? "" });
  const salvar = useMutation({
    mutationFn: () => apiFetch<WhatsappConfig>("/whatsapp/config", {
      method: "PUT",
      body: { ...form, transporte: "zapo", workerUrl: form.workerUrl.trim() || null, dddPadrao: form.dddPadrao.trim() || null },
    }),
    // A chave ["whatsapp", "integracao"] é a que o menu e a tela inicial leem
    // para mostrar o Atendimento: ligar aqui tem de refletir sem recarregar.
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] }); void queryClient.invalidateQueries({ queryKey: ["whatsapp", "integracao"] }); toast.success("Configuração do zapo-js salva"); },
    onError: (error) => toast.error(mensagemErro(error, "Erro ao salvar")),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Conexão local por QR Code</CardTitle><p className="mt-1 text-sm text-muted-foreground">Transporte atual pelo worker interno e pela biblioteca zapo-js.</p></div>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.ativo} onCheckedChange={(ativo) => setForm((f) => ({ ...f, ativo }))} />Ativo</label>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workerUrl">Endereço do worker</FieldLabel>
            <Input id="workerUrl" value={form.workerUrl} placeholder="http://rcgcba-whatsapp-worker:3100" onChange={(event) => setForm((f) => ({ ...f, workerUrl: event.target.value }))} />
            <FieldDescription>Endereço interno; o worker não deve ser publicado no Traefik.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="dddPadrao">DDD padrão</FieldLabel>
            <Input id="dddPadrao" inputMode="numeric" maxLength={2} className="max-w-24" placeholder="67" value={form.dddPadrao} onChange={(event) => setForm((f) => ({ ...f, dddPadrao: event.target.value.replace(/\D/g, "") }))} />
            <FieldDescription>Usado somente quando o telefone do cliente não possui DDD.</FieldDescription>
          </Field>
        </FieldGroup>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="retencaoDias">Retenção das conversas</FieldLabel>
            <div className="flex items-center gap-2"><Input id="retencaoDias" type="number" min={0} max={3650} className="max-w-32" value={form.retencaoDias} onChange={(event) => setForm((f) => ({ ...f, retencaoDias: Number(event.target.value) }))} /><span className="text-sm text-muted-foreground">dias</span></div>
            <FieldDescription>Zero mantém indefinidamente. O expurgo automático ainda não foi implementado.</FieldDescription>
          </Field>
          {/* Retenção olha para a frente (por quanto tempo guardar o que
              entrou); esta olha para trás (o quanto buscar do que o celular já
              tinha). Ficam lado a lado porque é justamente aí que se confunde
              uma com a outra. */}
          <Field>
            <FieldLabel htmlFor="historicoDias">Dias de histórico a importar</FieldLabel>
            <div className="flex items-center gap-2"><Input id="historicoDias" type="number" min={0} max={365} className="max-w-32" value={form.historicoDias} onChange={(event) => setForm((f) => ({ ...f, historicoDias: Number(event.target.value) }))} /><span className="text-sm text-muted-foreground">dias</span></div>
            <FieldDescription>
              Zero (padrão) não importa nada — só entra o que chega ao vivo. Acima de zero, o worker passa a
              arquivar as mensagens do aparelho para poder importá-las, o que inclui as conversas pessoais do
              vendedor. A instância precisa reconectar para a mudança valer, e a importação é disparada por
              instância, na aba Instâncias. Continua valendo a regra de sempre: só vira conversa o contato
              vinculado a um cliente.
            </FieldDescription>
          </Field>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200">
            <div className="flex gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Integração não oficial</div>
            {/* Mesmo texto que o vendedor lê ao conectar o aparelho — dois
                avisos divergentes sobre o mesmo risco é pior do que um. */}
            <p className="mt-1 pl-6 text-xs opacity-85">{WHATSAPP_AVISO_NAO_OFICIAL} Use um chip dedicado: alterações do WhatsApp podem interromper as sessões.</p>
          </div>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-t"><AvisoTroca config={config} alvo="zapo" /><Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : config.transporte === "zapo" ? "Salvar zapo-js" : "Salvar e usar zapo-js"}</Button></CardFooter>
    </Card>
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
  });
  // A chave fica fora do `form` de propósito: ela nunca vem da API, então o
  // campo nasce vazio mesmo com uma chave gravada. Vazio significa "não
  // mexi" — e é por isso que apagar precisa de um botão próprio.
  const [chave, setChave] = useState("");

  const salvar = useMutation({
    mutationFn: (opcoes: { apagarChave?: boolean } = {}) => apiFetch<WhatsappConfig>("/whatsapp/config", {
      method: "PUT",
      body: {
        ...form,
        transporte: "evolution_go",
        evolutionUrl: form.evolutionUrl.trim() || null,
        evolutionVersao: form.evolutionVersao.trim() || null,
        dddPadrao: form.dddPadrao.trim() || null,
        // String vazia apaga do lado da API; ausente mantém a que está lá.
        ...(opcoes.apagarChave ? { evolutionApiKey: "" } : chave.trim() ? { evolutionApiKey: chave.trim() } : {}),
      },
    }),
    onSuccess: (_dados, variaveis) => {
      setChave("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] }); void queryClient.invalidateQueries({ queryKey: ["whatsapp", "integracao"] });
      toast.success(variaveis?.apagarChave ? "Chave da Evolution GO removida" : "Configuração da Evolution GO salva");
    },
    onError: (error) => toast.error(mensagemErro(error, "Erro ao salvar")),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Gateway Evolution GO</CardTitle><p className="mt-1 text-sm text-muted-foreground">Serviço externo que mantém as instâncias pareadas e devolve os eventos por webhook.</p></div>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.ativo} onCheckedChange={(ativo) => setForm((f) => ({ ...f, ativo }))} />Ativo</label>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="evolutionUrl">Endereço da Evolution GO</FieldLabel>
            <Input id="evolutionUrl" value={form.evolutionUrl} placeholder="http://rcgcba-evolution-go:8080" onChange={(event) => setForm((f) => ({ ...f, evolutionUrl: event.target.value }))} />
            <FieldDescription>Endereço interno da rede Docker. O gateway não deve ser publicado no Traefik — quem o alcança fala pelo WhatsApp dos vendedores.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="evolutionApiKey">Chave de API (GLOBAL_API_KEY)</FieldLabel>
            <Input id="evolutionApiKey" type="password" autoComplete="off" value={chave} placeholder={config.evolutionApiKeyDefinida ? `Chave gravada${config.evolutionApiKeyUltimos4 ? ` (final ${config.evolutionApiKeyUltimos4})` : ""} — preencha só para trocar` : "Cole a chave administrativa do gateway"} onChange={(event) => setChave(event.target.value)} />
            <FieldDescription>
              Guardada cifrada e nunca devolvida pela API. Deixe em branco para manter a atual.
              {config.evolutionApiKeyDefinida ? <> <button type="button" className="underline underline-offset-2" onClick={() => salvar.mutate({ apagarChave: true })}>Remover chave gravada</button>.</> : null}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="evolutionVersao">Versão homologada</FieldLabel>
            <Input id="evolutionVersao" className="max-w-40" placeholder="0.7.2" value={form.evolutionVersao} onChange={(event) => setForm((f) => ({ ...f, evolutionVersao: event.target.value }))} />
            <FieldDescription>Registro de qual imagem está no ar. Diferença de versão é a primeira hipótese quando um evento para de chegar.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="dddPadraoEvolution">DDD padrão</FieldLabel>
            <Input id="dddPadraoEvolution" inputMode="numeric" maxLength={2} className="max-w-24" placeholder="67" value={form.dddPadrao} onChange={(event) => setForm((f) => ({ ...f, dddPadrao: event.target.value.replace(/\D/g, "") }))} />
            <FieldDescription>Usado somente quando o telefone do cliente não possui DDD. É o mesmo campo da aba zapo-js — a configuração é uma só.</FieldDescription>
          </Field>
        </FieldGroup>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="retencaoDiasEvolution">Retenção das conversas</FieldLabel>
            <div className="flex items-center gap-2"><Input id="retencaoDiasEvolution" type="number" min={0} max={3650} className="max-w-32" value={form.retencaoDias} onChange={(event) => setForm((f) => ({ ...f, retencaoDias: Number(event.target.value) }))} /><span className="text-sm text-muted-foreground">dias</span></div>
            <FieldDescription>Zero mantém indefinidamente. O expurgo automático ainda não foi implementado.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="historicoDiasEvolution">Dias de histórico a importar</FieldLabel>
            <div className="flex items-center gap-2"><Input id="historicoDiasEvolution" type="number" min={0} max={365} className="max-w-32" value={form.historicoDias} onChange={(event) => setForm((f) => ({ ...f, historicoDias: Number(event.target.value) }))} /><span className="text-sm text-muted-foreground">dias</span></div>
            <FieldDescription>
              Acima de zero, a importação é pedida por instância na aba Instâncias e o gateway entrega o histórico
              aos poucos, por evento — a contagem não aparece na hora, as conversas vão surgindo em Conversas.
              Continua valendo a regra de sempre: só vira conversa o contato vinculado a um cliente.
            </FieldDescription>
          </Field>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200">
            <div className="flex gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Integração não oficial</div>
            {/* O gateway muda quem mantém a sessão, não o fato de o pareamento
                ser o mesmo do WhatsApp Web. O risco para o número é idêntico. */}
            <p className="mt-1 pl-6 text-xs opacity-85">{WHATSAPP_AVISO_NAO_OFICIAL} Trocar o worker pelo gateway não muda esse risco: o pareamento continua sendo o do WhatsApp Web.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Fixe uma versão da imagem em produção, mantenha o gateway e o banco técnico dele só na rede interna e
            confira o Swagger da versão instalada — nomes de rota mudam entre versões. Ver{" "}
            <code className="rounded bg-muted px-1">docs/whatsapp/integracao-evolution-go.md</code>.
          </p>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-t">
        <AvisoTroca config={config} alvo="evolution_go" />
        <Button onClick={() => salvar.mutate({})} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : config.transporte === "evolution_go" ? "Salvar Evolution GO" : "Salvar e usar Evolution GO"}</Button>
      </CardFooter>
    </Card>
  );
}

function ProviderEmPreparacao({ icon: Icon, titulo, descricao, detalhes, href }: { icon: typeof Cloud; titulo: string; descricao: string; detalhes: string; href?: string }) {
  return (
    <Card><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <div className="rounded-2xl border bg-muted/40 p-4"><Icon className="size-7" /></div>
      <Badge variant="outline" className="mt-4">Adaptador em preparação</Badge>
      <h3 className="mt-3 font-heading text-xl font-semibold">{titulo}</h3>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{descricao}</p>
      <p className="mt-4 max-w-2xl rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{detalhes}</p>
      {href ? <Button variant="outline" className="mt-4" asChild><a href={href} target="_blank" rel="noreferrer">Ver projeto oficial <ExternalLink /></a></Button> : null}
    </CardContent></Card>
  );
}

function Instancias({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [remover, setRemover] = useState<WhatsappSessao | null>(null);
  const [limpar, setLimpar] = useState<WhatsappSessao | null>(null);
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
  const limparConversas = useMutation({
    mutationFn: (id: string) => apiFetch<{ conversas: number; mensagens: number }>(`/whatsapp/config/sessoes/${id}/conversas`, { method: "DELETE" }),
    onSuccess: (resultado) => {
      setLimpar(null);
      atualizar();
      // Também some do Atendimento: o vendedor pode estar com a tela aberta.
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      toast.success(resultado.conversas === 0 ? "Esta instância já não tinha conversas" : `${resultado.conversas} conversa(s) e ${resultado.mensagens} mensagem(ns) apagadas`);
    },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao limpar conversas")),
  });
  const apagarInstancia = useMutation({
    mutationFn: (id: string) => apiFetch(`/whatsapp/config/sessoes/${id}/instancia`, { method: "DELETE" }),
    onSuccess: () => { setApagar(null); atualizar(); toast.success("Instância excluída"); },
    // A recusa por histórico existente vem da API com o número de conversas —
    // é a mensagem que diz o que fazer, então não pode virar texto genérico.
    onError: (error) => toast.error(mensagemErro(error, "Falha ao excluir")),
  });
  const importar = useMutation({
    mutationFn: (sessao: WhatsappSessao) => apiFetch<{ dias: number; encontradas: number; conversas: number }>(`/whatsapp/config/sessoes/${sessao.id}/historico`, { method: "POST" }),
    onSuccess: (r, sessao) => {
      atualizar();
      // A Evolution GO só dispara a sincronização e não sabe o tamanho do
      // trabalho — o material chega depois, por evento. Zero ali não é "nada
      // encontrado", e dizer isso seria mentir para quem acabou de pedir.
      if (sessao.transporte === "evolution_go") {
        toast.success(`Sincronização dos últimos ${r.dias} dias pedida ao gateway. As conversas aparecem em Conversas conforme chegam.`);
        return;
      }
      toast.success(r.encontradas === 0 ? `Nada encontrado nos últimos ${r.dias} dias no aparelho` : `Importando ${r.encontradas} mensagem(ns) de ${r.conversas} conversa(s). Elas aparecem em Conversas conforme entram.`);
    },
    onError: (error) => toast.error(mensagemErro(error, "Falha ao importar histórico")),
  });

  // Vale para `zapo` e `evolution_go`: os dois pareiam o WhatsApp Web ao
  // aparelho do vendedor, e o risco para o número é o mesmo. O transporte de
  // cada instância aparece na coluna Provedor. Some quando a empresa inteira
  // estiver na API oficial.
  const alguemNaoOficial = data.some((s) => s.transporte !== "cloud_api");

  return (
    <>
      {alguemNaoOficial ? (
        <div className="mb-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1 text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              API não oficial ({WHATSAPP_TRANSPORTE_ROTULO[config.transporte]})
            </p>
            <p className="text-muted-foreground">{WHATSAPP_AVISO_NAO_OFICIAL}</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader className="border-b"><div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Instâncias dos vendedores</CardTitle><p className="mt-1 text-sm text-muted-foreground">Estado atualizado a cada 10 segundos. A primeira conexão é iniciada pelo vendedor em Conversas.</p></div><Badge variant="outline">{data.length} {data.length === 1 ? "instância" : "instâncias"}</Badge></div></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Carregando instâncias...</p> : null}
          {!isLoading && data.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center"><Smartphone className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">Nenhuma instância criada</p><p className="mt-1 text-sm text-muted-foreground">O vendedor deve abrir Comercial → Conversas e iniciar o pareamento.</p></div> : null}
          {data.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead>Número</TableHead><TableHead>Provedor</TableHead><TableHead>Estado</TableHead><TableHead>Última conexão</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>{data.map((sessao) => (
                <TableRow key={sessao.id}>
                  <TableCell className="font-medium">{sessao.vendedorNome}</TableCell><TableCell>{sessao.numero ?? "—"}</TableCell><TableCell>{WHATSAPP_TRANSPORTE_ROTULO[sessao.transporte]}</TableCell>
                  <TableCell><Badge variant={STATUS[sessao.status].variant}>{STATUS[sessao.status].rotulo}</Badge></TableCell><TableCell>{formatarData(sessao.ultimaConexao)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Ações de ${sessao.vendedorNome}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => reconectar.mutate(sessao.id)} disabled={reconectar.isPending}><RefreshCw /> {sessao.status === "desconectada" ? "Conectar" : "Reconectar"}</DropdownMenuItem>
                        {/* Importar exige aparelho ligado (o material vem de
                            lá) e dias configurados — sem os dois o item fica
                            fora, em vez de oferecer algo que responde erro. */}
                        {config.historicoDias > 0 && sessao.status === "conectada" ? (
                          <DropdownMenuItem onSelect={() => importar.mutate(sessao)} disabled={importar.isPending}><History /> Importar histórico ({config.historicoDias} dias)</DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem variant="destructive" onSelect={() => setRemover(sessao)}><Trash2 /> Remover conexão</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setLimpar(sessao)}><Eraser /> Limpar conversas</DropdownMenuItem>
                        {/* Excluir só a desconectada: é a regra da API, e um
                            item que sempre responde 400 é pior que nenhum. */}
                        {sessao.status === "desconectada" ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => setApagar(sessao)}><Trash2 /> Excluir instância</DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={Boolean(remover)} onOpenChange={(open) => { if (!open) setRemover(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Remover conexão?</DialogTitle><DialogDescription>A sessão de {remover?.vendedorNome} será encerrada e marcada como desconectada. O histórico de conversas será preservado.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button variant="destructive" disabled={excluir.isPending} onClick={() => remover && excluir.mutate(remover.id)}>{excluir.isPending ? "Removendo..." : "Remover conexão"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(limpar)} onOpenChange={(open) => { if (!open) setLimpar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar as conversas de {limpar?.vendedorNome}?</DialogTitle>
            <DialogDescription>
              Apaga as conversas, mensagens, reações, agendamentos e ações registradas desta instância, e as
              notificações do sino que apontavam para elas. Os contatos e o vínculo com o cadastro de clientes
              continuam — ninguém precisa revincular nada depois. <strong>Não tem volta.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" disabled={limparConversas.isPending} onClick={() => limpar && limparConversas.mutate(limpar.id)}>{limparConversas.isPending ? "Limpando..." : "Limpar conversas"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(apagar)} onOpenChange={(open) => { if (!open) setApagar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir a instância de {apagar?.vendedorNome}?</DialogTitle>
            <DialogDescription>
              A linha some da lista. Só é possível com a instância desconectada e sem conversas no histórico —
              se ainda houver conversas, limpe-as antes. O vendedor pode parear de novo depois, pela tela de
              Atendimento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" disabled={apagarInstancia.isPending} onClick={() => apagar && apagarInstancia.mutate(apagar.id)}>{apagarInstancia.isPending ? "Excluindo..." : "Excluir instância"}</Button>
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
