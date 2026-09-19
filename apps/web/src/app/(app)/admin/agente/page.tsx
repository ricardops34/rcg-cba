"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PROVEDORES,
  SYSTEM_PROMPT_PADRAO,
  type AgenteConfig,
  type AgenteCredencial,
  type AgenteFerramenta,
  type AgenteOauthInicio,
  type ProvedorIa,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FlaskConical,
  Plug,
  Settings2,
  Shield,
  Unplug,
} from "lucide-react";


/**
 * Configuração do agente de IA. A chave de API nunca volta do servidor — o
 * campo mostra apenas os últimos 4 caracteres do que está gravado, e deixá-lo
 * em branco mantém a chave atual.
 */
export default function AgenteConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["agente-config"],
    queryFn: () => apiFetch<AgenteConfig>("/agente/config"),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }
  // O formulário só monta com os dados em mãos, e recebe o estado inicial por
  // prop — evita o vaivém de sincronizar estado local com a query num efeito.
  return <AgenteConfigForm config={data} />;
}

/**
 * Provedor gravado que não existe mais no catálogo (foi o caso de `xai` e
 * `groq`, removidos) cai para o padrão em vez de derrubar a tela.
 *
 * Sem isso, `PROVEDORES[provedor]` volta `undefined` e a página inteira quebra
 * num TypeError — logo a página que serviria para corrigir a configuração. O
 * endpoint e o modelo vêm junto, porque os que estavam gravados eram do
 * provedor antigo e não funcionariam no novo.
 */
const PROVEDOR_PADRAO: ProvedorIa = "anthropic";

function normalizarProvedor(config: AgenteConfig) {
  if (config.provedor in PROVEDORES) {
    return {
      provedor: config.provedor,
      modelo: config.modelo,
      baseUrl: config.baseUrl,
    };
  }
  const padrao = PROVEDORES[PROVEDOR_PADRAO];
  return {
    provedor: PROVEDOR_PADRAO,
    modelo: padrao.modeloPadrao,
    baseUrl: padrao.baseUrl,
  };
}

/** Estado do formulário — compartilhado com a aba de cada provedor. */
interface FormAgente {
  ativo: boolean;
  nomeAgente: string;
  mensagemBoasVindas: string;
  provedor: ProvedorIa;
  modelo: string;
  baseUrl: string;
  apiKey: string;
  systemPrompt: string;
  temperatura: number;
  maxTokens: number;
  maxIteracoesFerramentas: number;
}

function AgenteConfigForm({ config }: { config: AgenteConfig }) {
  const queryClient = useQueryClient();
  const inicial = normalizarProvedor(config);

  const [form, setForm] = useState<FormAgente>({
    ativo: config.ativo,
    nomeAgente: config.nomeAgente,
    mensagemBoasVindas: config.mensagemBoasVindas ?? "",
    provedor: inicial.provedor,
    modelo: inicial.modelo,
    baseUrl: inicial.baseUrl,
    apiKey: "",
    systemPrompt: config.systemPrompt ?? "",
    temperatura: config.temperatura,
    maxTokens: config.maxTokens,
    maxIteracoesFerramentas: config.maxIteracoesFerramentas,
  });
  const [modelos, setModelos] = useState<string[]>([]);

  const provedorInvalido = !(config.provedor in PROVEDORES);

  /**
   * Trocar de provedor troca endpoint e modelo junto: manter a baseUrl da
   * OpenAI apontando para um modelo Claude seria uma configuração que nunca
   * funciona. Se já houve uso daquele provedor, volta o modelo de antes.
   */
  const usarProvedor = (novo: ProvedorIa) => {
    const alvo = PROVEDORES[novo];
    const anterior = config.credenciais.find((c) => c.provedor === novo);
    setForm((f) => ({
      ...f,
      provedor: novo,
      baseUrl: alvo.baseUrl,
      modelo: anterior?.modelo ?? alvo.modeloPadrao,
      apiKey: "",
    }));
    setModelos([]);
  };

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<AgenteConfig>("/agente/config", {
        method: "PUT",
        body: {
          ativo: form.ativo,
          nomeAgente: form.nomeAgente,
          mensagemBoasVindas: form.mensagemBoasVindas.trim() || null,
          provedor: form.provedor,
          modelo: form.modelo,
          baseUrl: form.baseUrl,
          // Só manda a chave se o usuário digitou algo — vazio mantém a atual.
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          systemPrompt: form.systemPrompt || null,
          temperatura: form.temperatura,
          maxTokens: form.maxTokens,
          maxIteracoesFerramentas: form.maxIteracoesFerramentas,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agente-config"] });
      void queryClient.invalidateQueries({ queryKey: ["agente-apresentacao"] });
      setForm((f) => ({ ...f, apiKey: "" }));
      toast.success("Configuração salva");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar"),
  });

  const testar = useMutation({
    mutationFn: (provedor: ProvedorIa) =>
      apiFetch<{ ok: boolean; modelos: string[] }>("/agente/config/testar", {
        method: "POST",
        body: {
          provedor,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        },
      }),
    onSuccess: (r) => {
      setModelos(r.modelos);
      toast.success(`Conexão ok — ${r.modelos.length} modelo(s) na conta`);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao conectar no provedor",
      ),
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página no padrão do sistema */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agente IA</h1>
          <p className="text-sm text-muted-foreground">
            Configurações de identidade, provedor de inteligência artificial e ferramentas do assistente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
          >
            Salvar alterações
          </Button>
        </div>
      </div>

      {provedorInvalido ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            A configuração estava usando o provedor{" "}
            <code>{config.provedor}</code>, que não existe mais. Já
            está selecionado {PROVEDORES[PROVEDOR_PADRAO].rotulo}{" "}
            como substituto — <strong>clique em Salvar</strong> para
            gravar a troca.
          </p>
        </div>
      ) : null}

      {/* 3 Abas Lógicas */}
      <Tabs defaultValue="identidade" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="identidade">Identidade & Prompt</TabsTrigger>
          <TabsTrigger value="provedor">Provedor de IA</TabsTrigger>
          <TabsTrigger value="ferramentas">Ferramentas & Limites</TabsTrigger>
        </TabsList>

        {/* ---------------- Aba 1: Identidade & Prompt ---------------- */}
        <TabsContent value="identidade" className="space-y-6 pt-2">
          <Card>
            <CardContent className="pt-6">
              <FieldSet>
                <FieldLegend>Identidade e Apresentação</FieldLegend>
                <FieldGroup>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={form.ativo}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, ativo: v }))
                      }
                    />
                    Agente ativo
                  </label>
                  <FieldDescription>
                    Desligado, o ícone do assistente não aparece para ninguém e
                    as chamadas ao provedor são recusadas.
                  </FieldDescription>

                  <Field>
                    <FieldLabel htmlFor="nomeAgente">Nome do agente</FieldLabel>
                    <Input
                      id="nomeAgente"
                      value={form.nomeAgente}
                      maxLength={40}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nomeAgente: e.target.value }))
                      }
                    />
                    <FieldDescription>
                      Como o assistente se apresenta à equipe. Trocar de LLM não
                      troca o nome pelo qual o time o conhece.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mensagemBoasVindas">
                      Mensagem de boas-vindas
                    </FieldLabel>
                    <Textarea
                      id="mensagemBoasVindas"
                      rows={3}
                      maxLength={1000}
                      value={form.mensagemBoasVindas}
                      placeholder={`Olá! Sou o ${form.nomeAgente || "Assistente"}. Posso consultar a sua carteira, montar orçamentos e preparar o seu dia. O que você precisa?`}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mensagemBoasVindas: e.target.value,
                        }))
                      }
                    />
                    <FieldDescription>
                      Abre toda conversa nova, no lugar da tela em branco — é
                      onde a equipe descobre o que dá para pedir. Em branco,
                      usa o exemplo acima.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FieldSet>
                <FieldLegend>Prompt Base / Instruções</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="systemPrompt">
                    Instruções do agente
                  </FieldLabel>
                  <Textarea
                    id="systemPrompt"
                    rows={8}
                    className="font-mono text-xs leading-relaxed"
                    value={form.systemPrompt}
                    placeholder={SYSTEM_PROMPT_PADRAO}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                    }
                  />
                  <FieldDescription>
                    Define o tom e as regras de resposta, e vale para qualquer
                    provedor. O sistema acrescenta automaticamente o contexto da
                    sessão (usuário, data e quais ferramentas ele pode usar).
                  </FieldDescription>
                </Field>
              </FieldSet>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Aba 2: Provedor de IA ---------------- */}
        <TabsContent value="provedor" className="space-y-6 pt-2">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Selecione o Provedor de IA</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(PROVEDORES) as ProvedorIa[]).map((p) => {
                const info = PROVEDORES[p];
                const selecionado = form.provedor === p;
                const emUsoNoBanco = config.provedor === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => usarProvedor(p)}
                    className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                      selecionado
                        ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                        : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/30"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{info.rotulo}</span>
                        {emUsoNoBanco && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" /> Em uso
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Modelo padrão: {info.modeloPadrao}
                      </p>
                    </div>
                    <div className="pt-3 text-xs font-medium text-primary">
                      {selecionado ? "✓ Selecionado" : "Clique para configurar →"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <ProvedorTab
                provedor={form.provedor}
                emUso={true}
                config={config}
                form={form}
                setForm={setForm}
                modelos={modelos}
                onUsar={() => usarProvedor(form.provedor)}
                onTestar={() => testar.mutate(form.provedor)}
                testando={testar.isPending}
                onMudou={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["agente-config"],
                  })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Aba 3: Ferramentas & Limites ---------------- */}
        <TabsContent value="ferramentas" className="space-y-6 pt-2">
          <Card>
            <CardContent className="pt-6">
              <FieldSet>
                <FieldLegend>Limites de Execução</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="maxIteracoes">
                    Máximo de consultas por pergunta
                  </FieldLabel>
                  <Input
                    id="maxIteracoes"
                    type="number"
                    min={1}
                    max={10}
                    className="sm:max-w-40"
                    value={form.maxIteracoesFerramentas}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxIteracoesFerramentas: Number(e.target.value),
                      }))
                    }
                  />
                  <FieldDescription>
                    {form.provedor === "codex" &&
                    form.maxIteracoesFerramentas < 8 ? (
                      <span className="text-amber-600">
                        Os modelos do Codex encadeiam várias consultas antes de
                        responder. Com menos de 8, a resposta costuma sair como
                        &quot;não consegui concluir dentro do limite de
                        passos&quot;.
                      </span>
                    ) : (
                      "Quantas ferramentas o agente pode consultar em sequência antes de ter que responder."
                    )}
                  </FieldDescription>
                </Field>
              </FieldSet>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FerramentasSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
        >
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

/**
 * Aba de um provedor.
 *
 * A **credencial** é sempre editável, mesmo quando o provedor não está em uso:
 * ela é gravada por provedor (`AgenteCredencial`), então dá para deixar a
 * chave do Claude pronta enquanto se usa o Codex, e a troca depois é um clique.
 *
 * Já **modelo, endpoint e ajustes** pertencem à configuração ativa — o banco
 * guarda um só de cada. Editá-los num provedor que não está em uso não teria
 * onde gravar, então aparecem desabilitados com o motivo, em vez de aceitarem
 * um valor que se perderia ao salvar.
 */
function ProvedorTab({
  provedor,
  emUso,
  config,
  form,
  setForm,
  modelos,
  onUsar,
  onTestar,
  testando,
  onMudou,
}: {
  provedor: ProvedorIa;
  emUso: boolean;
  config: AgenteConfig;
  form: FormAgente;
  setForm: Dispatch<SetStateAction<FormAgente>>;
  modelos: string[];
  onUsar: () => void;
  onTestar: () => void;
  testando: boolean;
  onMudou: () => void;
}) {
  const info = PROVEDORES[provedor];
  const credencial = config.credenciais.find((c) => c.provedor === provedor);

  return (
    <FieldGroup>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <div className="text-sm">
          <p className="font-medium">{info.rotulo}</p>
          <p className="pt-0.5 text-xs text-muted-foreground">
            {emUso
              ? "Este é o provedor em uso pelo agente."
              : "Configurado, mas não é o provedor em uso."}
          </p>
        </div>
        {emUso ? (
          <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Em uso
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onUsar}>
            Usar este provedor
          </Button>
        )}
      </div>

      {info.advertencia ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{info.advertencia}</p>
        </div>
      ) : null}

      <FieldSet>
        <FieldLegend>Credencial</FieldLegend>
        {info.autenticacao === "oauth" ? (
          <ConexaoOauth
            credencial={credencial}
            rotulo={info.rotulo}
            onMudou={onMudou}
          />
        ) : (
          <Field>
            <FieldLabel htmlFor={`apiKey-${provedor}`}>Chave de API</FieldLabel>
            <PasswordInput
              id={`apiKey-${provedor}`}
              value={emUso ? form.apiKey : ""}
              disabled={!emUso}
              placeholder={
                provedor === "ollama"
                  ? "Opcional (instâncias locais do Ollama não exigem chave)"
                  : credencial?.apiKeyPreenchida
                    ? `•••• ${credencial.apiKeyUltimos4} (gravada)`
                    : `Cole a chave da ${info.rotulo}`
              }
              onChange={(e) =>
                setForm((f) => ({ ...f, apiKey: e.target.value }))
              }
            />
            <FieldDescription>
              {provedor === "ollama" ? (
                <>Instâncias locais do Ollama funcionam sem chave de API. Preencha apenas se seu servidor exigir autenticação.</>
              ) : !emUso ? (
                <>
                  Ative este provedor acima para gravar a chave dele.{" "}
                  <a
                    href={info.urlChave}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Obter chave
                  </a>
                </>
              ) : form.apiKey &&
                info.prefixoChave &&
                !form.apiKey.startsWith(info.prefixoChave) ? (
                <span className="text-amber-600">
                  {/* Colar a chave `sk-ant-` da Anthropic no campo da OpenAI
                      (e vice-versa) é o erro mais provável aqui. */}
                  Esta chave não começa com <code>{info.prefixoChave}</code> —
                  confira se ela é mesmo da {info.rotulo}.
                </span>
              ) : (
                <>
                  Em branco mantém a chave atual. Ela nunca é exibida de volta.{" "}
                  <a
                    href={info.urlChave}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Obter chave
                  </a>
                </>
              )}
            </FieldDescription>
          </Field>
        )}
      </FieldSet>

      <FieldSet>
        <FieldLegend>Modelo</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`modelo-${provedor}`}>Modelo</FieldLabel>
            {emUso && (modelos.length > 0 || (info.modelos && info.modelos.length > 0)) ? (
              <select
                id={`modelo-${provedor}`}
                disabled={!emUso}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-100"
                value={form.modelo}
                onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
              >
                {(() => {
                  const opcoes = Array.from(
                    new Set([
                      ...(form.modelo ? [form.modelo] : []),
                      ...(modelos.length ? modelos : (info.modelos ?? [])),
                    ]),
                  );
                  return opcoes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ));
                })()}
              </select>
            ) : (
              <>
                <Input
                  id={`modelo-${provedor}`}
                  list={`modelos-${provedor}`}
                  disabled={!emUso}
                  value={emUso ? form.modelo : (credencial?.modelo ?? info.modeloPadrao)}
                  onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                />
                <datalist id={`modelos-${provedor}`}>
                  {(modelos.length && emUso ? modelos : (info.modelos ?? [])).map(
                    (m) => (
                      <option key={m} value={m} />
                    ),
                  )}
                </datalist>
              </>
            )}
            <FieldDescription>
              {!emUso
                ? "Disponível quando este for o provedor em uso."
                : info.modelos
                  ? "Estes são os modelos que a assinatura ChatGPT aceita neste endpoint."
                  : modelos.length > 0
                    ? `${modelos.length} modelo(s) detectado(s) no servidor Ollama/Docker.`
                    : 'Clique em "Testar conexão" abaixo para carregar a lista de modelos disponíveis no Docker.'}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`baseUrl-${provedor}`}>Endpoint</FieldLabel>
            <Input
              id={`baseUrl-${provedor}`}
              disabled={!emUso}
              value={emUso ? form.baseUrl : info.baseUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, baseUrl: e.target.value }))
              }
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Ajustes deste modelo</FieldLegend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* A Anthropic removeu `temperature` nos modelos atuais e o Codex
              também não aceita — enviá-lo devolve 400. Esconder o controle é
              melhor que deixar o usuário ajustar algo que quebraria a chamada. */}
          {info.aceitaTemperatura ? (
            <Field>
              <FieldLabel htmlFor={`temperatura-${provedor}`}>
                Temperatura: {form.temperatura.toFixed(2)}
              </FieldLabel>
              <input
                id={`temperatura-${provedor}`}
                type="range"
                min={0}
                max={2}
                step={0.05}
                disabled={!emUso}
                value={form.temperatura}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temperatura: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
              <FieldDescription>
                Baixa (0–0,4) para respostas previsíveis sobre dados; alta para
                texto mais criativo. Para consulta de números, mantenha baixa.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Temperatura</FieldLabel>
              <FieldDescription>
                Os modelos atuais da {info.rotulo} não aceitam o parâmetro de
                temperatura — a profundidade da resposta é decidida pelo próprio
                modelo. Ajuste o comportamento pelo prompt base.
              </FieldDescription>
            </Field>
          )}

          {/* O backend do Codex recusa `max_output_tokens` (400 "Unsupported
              parameter") — quem limita o tamanho lá é a própria assinatura. */}
          {provedor === "codex" ? (
            <Field>
              <FieldLabel>Tamanho máximo da resposta</FieldLabel>
              <FieldDescription>
                O Codex não aceita limite de tokens por requisição — o teto é o
                da sua assinatura ChatGPT.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor={`maxTokens-${provedor}`}>
                Tamanho máximo da resposta
              </FieldLabel>
              <Input
                id={`maxTokens-${provedor}`}
                type="number"
                min={256}
                max={32000}
                disabled={!emUso}
                value={form.maxTokens}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))
                }
              />
            </Field>
          )}
        </div>
      </FieldSet>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTestar}
          disabled={testando}
        >
          <Plug className="size-4" />
          Testar conexão
        </Button>
      </div>
    </FieldGroup>
  );
}

/**
 * Conexão com a conta ChatGPT (provedores com autenticação OAuth).
 *
 * O fluxo tem duas etapas porque não pode ter uma: o cliente OAuth do Codex
 * tem `redirect_uri` fixo em `localhost:1455`, e o servidor da API não tem como
 * receber esse callback. Então o administrador abre a URL de autorização, o
 * navegador dele termina numa página de erro de conexão — o que é o esperado —
 * e traz de volta a URL da barra de endereço, que carrega o código.
 *
 * Quem já usa o Codex CLI na própria máquina não precisa de nada disso: o
 * segundo caminho importa a sessão já existente.
 */
function ConexaoOauth({
  credencial,
  rotulo,
  onMudou,
}: {
  credencial: AgenteCredencial | undefined;
  rotulo: string;
  onMudou: () => void;
}) {
  const [inicio, setInicio] = useState<AgenteOauthInicio | null>(null);
  const [retorno, setRetorno] = useState("");
  const [authJson, setAuthJson] = useState("");
  const [modo, setModo] = useState<"navegador" | "cli">("navegador");

  const erro = (err: unknown, padrao: string) =>
    toast.error(err instanceof ApiError ? err.message : padrao);

  const iniciar = useMutation({
    mutationFn: () =>
      apiFetch<AgenteOauthInicio>("/agente/config/oauth/iniciar", {
        method: "POST",
        body: {},
      }),
    onSuccess: (r) => {
      setInicio(r);
      window.open(r.url, "_blank", "noopener");
    },
    onError: (e) => erro(e, "Não foi possível gerar o link de autorização"),
  });

  const concluir = useMutation({
    mutationFn: () =>
      apiFetch<AgenteConfig>("/agente/config/oauth/concluir", {
        method: "POST",
        body: { retorno },
      }),
    onSuccess: () => {
      setInicio(null);
      setRetorno("");
      onMudou();
      toast.success("Conta conectada");
    },
    onError: (e) => erro(e, "Não foi possível concluir a conexão"),
  });

  const importar = useMutation({
    mutationFn: () =>
      apiFetch<AgenteConfig>("/agente/config/oauth/importar", {
        method: "POST",
        body: { conteudo: authJson },
      }),
    onSuccess: () => {
      setAuthJson("");
      onMudou();
      toast.success("Sessão do Codex CLI importada");
    },
    onError: (e) => erro(e, "Não foi possível importar a sessão"),
  });

  const desconectar = useMutation({
    mutationFn: () =>
      apiFetch<AgenteConfig>("/agente/config/oauth/desconectar", {
        method: "POST",
        body: {},
      }),
    onSuccess: () => {
      onMudou();
      toast.success("Conta desconectada");
    },
    onError: (e) => erro(e, "Não foi possível desconectar"),
  });

  if (credencial?.conectado) {
    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-medium">
                Conectado{credencial.contaEmail ? ` — ${credencial.contaEmail}` : ""}
              </p>
              <p className="pt-0.5 text-xs text-muted-foreground">
                {/* A renovação é automática e silenciosa; mostrar a validade é
                    o que dá ao administrador uma primeira pista quando o
                    refresh token é revogado do lado da OpenAI. */}
                {credencial.tokenExpiraEm
                  ? `Token válido até ${new Date(credencial.tokenExpiraEm).toLocaleString("pt-BR")} — renovado automaticamente.`
                  : "Renovação automática."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => desconectar.mutate()}
            disabled={desconectar.isPending}
          >
            <Unplug className="size-4" />
            Desconectar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex gap-2 pb-3">
        <button
          type="button"
          onClick={() => setModo("navegador")}
          className={`rounded-md px-3 py-1 text-xs transition ${
            modo === "navegador" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          Conectar pelo navegador
        </button>
        <button
          type="button"
          onClick={() => setModo("cli")}
          className={`rounded-md px-3 py-1 text-xs transition ${
            modo === "cli" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          Importar do Codex CLI
        </button>
      </div>

      {modo === "navegador" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>1. Autorizar no {rotulo}</FieldLabel>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => iniciar.mutate()}
                disabled={iniciar.isPending}
              >
                <ExternalLink className="size-4" />
                {inicio ? "Abrir novamente" : "Abrir autorização"}
              </Button>
            </div>
            <FieldDescription>
              Abre a tela de login da OpenAI numa aba nova. Depois de autorizar,
              o navegador vai tentar ir para <code>localhost:1455</code> e{" "}
              <strong>mostrar erro de conexão — isso é o esperado</strong>, não
              é falha. Copie a URL da barra de endereço dessa página.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="retorno">2. URL de retorno</FieldLabel>
            <Textarea
              id="retorno"
              rows={3}
              value={retorno}
              placeholder="http://localhost:1455/auth/callback?code=...&state=..."
              onChange={(e) => setRetorno(e.target.value)}
            />
            <FieldDescription>
              Cole a URL inteira (ou só o código). Ele vale uma única vez e
              expira em minutos — se der erro, refaça o passo 1.
            </FieldDescription>
            <div>
              <Button
                type="button"
                size="sm"
                onClick={() => concluir.mutate()}
                disabled={concluir.isPending || !retorno.trim()}
              >
                <Plug className="size-4" />
                Conectar
              </Button>
            </div>
          </Field>
        </FieldGroup>
      ) : (
        <Field>
          <FieldLabel htmlFor="authJson">Conteúdo do auth.json</FieldLabel>
          <Textarea
            id="authJson"
            rows={4}
            value={authJson}
            placeholder='{"tokens":{"refresh_token":"...","account_id":"..."}}'
            onChange={(e) => setAuthJson(e.target.value)}
          />
          <FieldDescription>
            Para quem já usa o <code>codex</code> na própria máquina: cole o
            conteúdo de <code>~/.codex/auth.json</code> (no Windows,{" "}
            <code>%USERPROFILE%\.codex\auth.json</code>). Vale saber: a partir
            daí a API e o CLI passam a disputar a mesma sessão, e quando um
            renova o token o outro pode precisar de um novo{" "}
            <code>codex login</code>.
          </FieldDescription>
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => importar.mutate()}
              disabled={importar.isPending || !authJson.trim()}
            >
              <Plug className="size-4" />
              Importar
            </Button>
          </div>
        </Field>
      )}
    </div>
  );
}

/**
 * Governança das ferramentas, em aba própria.
 *
 * Tudo fica aberto de propósito. A versão anterior recolhia cada ferramenta
 * num accordion e escondia justamente o que mais se mexe aqui — a atribuição
 * por perfil —, transformando "liberar uma ferramenta para o Gerente" numa
 * caçada a cliques. São dez linhas; a rolagem custa menos que o clique extra.
 *
 * O que está aqui é decisão da empresa, não do código: quais ferramentas o
 * agente pode usar, como cada uma se apresenta ao modelo e quem tem direito de
 * usá-la. A implementação continua no servidor — esta tela não cria ferramenta,
 * configura as que existem.
 *
 * A permissão aparece como texto fixo de propósito: ela vem do código e é o
 * piso de segurança. A configuração daqui **restringe**; nada nela devolve um
 * acesso que o perfil do usuário já não tivesse.
 */
function FerramentasSection() {
  const queryClient = useQueryClient();

  const { data: ferramentas } = useQuery({
    queryKey: ["agente-ferramentas"],
    queryFn: () => apiFetch<AgenteFerramenta[]>("/agente/ferramentas"),
  });
  const { data: termos } = useQuery({
    queryKey: ["agente-ferramentas", "termos"],
    queryFn: () =>
      apiFetch<{ aceitoEm: string | null; aceitoPor: string | null }>(
        "/agente/ferramentas/termos",
      ),
  });
  const [aceiteLocal, setAceiteLocal] = useState(false);
  const termosAceitos = aceiteLocal || !!termos?.aceitoEm;

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: perfis } = useQuery({
    queryKey: ["perfis", "lista"],
    queryFn: () =>
      apiFetch<{ data: { id: string; nome: string; sistemaBase: boolean }[] }>("/perfis", {
        query: { pageSize: 100 },
      }),
  });

  const salvar = useMutation({
    mutationFn: ({
      chave,
      body,
    }: {
      chave: string;
      body: Record<string, unknown>;
    }) =>
      apiFetch<AgenteFerramenta[]>(`/agente/ferramentas/${chave}`, {
        method: "PUT",
        body,
      }),
    onSuccess: (lista) => {
      queryClient.setQueryData(["agente-ferramentas"], lista);
      toast.success("Ferramenta atualizada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar"),
  });

  const restaurar = useMutation({
    mutationFn: (chave: string) =>
      apiFetch<AgenteFerramenta[]>(`/agente/ferramentas/${chave}/restaurar`, {
        method: "POST",
      }),
    onSuccess: (lista) => {
      queryClient.setQueryData(["agente-ferramentas"], lista);
      toast.success("Textos restaurados ao padrão do sistema");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao restaurar"),
  });

  const aceitarTermos = useMutation({
    mutationFn: () =>
      apiFetch<{ aceitoEm: string; aceitoPor: string }>(
        "/agente/ferramentas/termos",
        { method: "POST" },
      ),
    onSuccess: () => {
      setAceiteLocal(true);
      toast.success("Termos aceitos. Os textos ficaram editáveis.");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao aceitar"),
  });

  if (!ferramentas) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Ferramentas de Negócio ({ferramentas.length})</h2>
          <p className="text-xs text-muted-foreground">
            Ligue/desligue individualmente as capacidades de consulta do agente.
          </p>
        </div>
      </div>

      {!termosAceitos && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Editar os textos exige aceitar os termos
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>• Reescrever a descrição ou o comportamento muda como o assistente fala com clientes e com a equipe.</li>
            <li>• O efeito não aparece nesta tela: aparece numa conversa, depois. Teste antes de dar por certo.</li>
            <li>• Estes textos servem para <strong>tom e cuidado</strong>. Não controlam acesso: quem alcança qual dado é decidido no servidor.</li>
          </ul>
          <Button
            size="sm"
            className="mt-3"
            disabled={aceitarTermos.isPending}
            onClick={() => aceitarTermos.mutate()}
          >
            Li e aceito
          </Button>
        </div>
      )}

      <PromptPreviaETeste />

      <div className="space-y-2">
        {ferramentas.map((f) => {
          const isExpanded = expandedKey === f.chave;
          return (
            <div
              key={f.chave}
              className={`rounded-lg border transition-all ${
                f.ativa ? "border-border bg-card" : "border-border/60 bg-muted/20 opacity-70"
              }`}
            >
              {/* Linha Resumida (Cabeçalho da Ferramenta) */}
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Switch
                    checked={f.ativa}
                    onCheckedChange={(v) =>
                      salvar.mutate({ chave: f.chave, body: { ativa: v } })
                    }
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-semibold">{f.chave}</code>
                      {f.escrita && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          grava (confirmação)
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Shield className="size-3" />
                        <code>{f.permissao}</code>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-xl">
                      {f.descricao || f.descricaoPadrao}
                    </p>
                  </div>
                </div>

                {f.ativa && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setExpandedKey(isExpanded ? null : f.chave)}
                  >
                    <Settings2 className="size-3.5" />
                    {isExpanded ? "Ocultar" : "Configurar"}
                    {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </Button>
                )}
              </div>

              {/* Conteúdo Detalhado (Accordion) */}
              {f.ativa && isExpanded && (
                <div className="border-t p-4 bg-muted/10 space-y-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`desc-${f.chave}`}>
                        Descrição para o modelo
                      </FieldLabel>
                      <Textarea
                        id={`desc-${f.chave}`}
                        rows={3}
                        disabled={!termosAceitos}
                        defaultValue={f.descricao}
                        placeholder={f.descricaoPadrao}
                        onBlur={(e) => {
                          const novo = e.target.value.trim();
                          if (novo !== f.descricao) {
                            salvar.mutate({
                              chave: f.chave,
                              body: { descricao: novo },
                            });
                          }
                        }}
                      />
                      <FieldDescription>
                        Ensina ao modelo <strong>quando</strong> acionar esta ferramenta.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`instr-${f.chave}`}>
                        Como se portar ao usar
                      </FieldLabel>
                      <Textarea
                        id={`instr-${f.chave}`}
                        rows={3}
                        disabled={!termosAceitos}
                        defaultValue={f.instrucoes}
                        placeholder={
                          f.instrucoesPadrao ||
                          "Ex.: confirme qual documento antes de mandar; não prometa antes de a ferramenta responder."
                        }
                        onBlur={(e) => {
                          const novo = e.target.value.trim();
                          if (novo !== f.instrucoes) {
                            salvar.mutate({
                              chave: f.chave,
                              body: { instrucoes: novo },
                            });
                          }
                        }}
                      />
                      <FieldDescription>
                        Define tom e cuidado ao utilizar esta ferramenta.
                      </FieldDescription>
                    </Field>

                    <Field className="lg:col-span-2">
                      <FieldLabel>Perfis com direito de uso</FieldLabel>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(perfis?.data ?? []).map((p) => {
                          if (p.sistemaBase) {
                            return (
                              <span
                                key={p.id}
                                title="O Administrador sempre tem acesso a todas as ferramentas"
                                className="cursor-default rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400"
                              >
                                {p.nome} · sempre
                              </span>
                            );
                          }
                          const marcado = f.perfilIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() =>
                                salvar.mutate({
                                  chave: f.chave,
                                  body: {
                                    perfilIds: marcado
                                      ? f.perfilIds.filter((x) => x !== p.id)
                                      : [...f.perfilIds, p.id],
                                  },
                                })
                              }
                              className={`rounded-md border px-2 py-1 text-xs transition ${
                                marcado
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {p.nome}
                            </button>
                          );
                        })}
                      </div>
                      <FieldDescription>
                        {f.perfilIds.length === 0
                          ? `Nenhum marcado: vale para todos os perfis que já tenham ${f.permissao}.`
                          : "Marcar restringe o uso a estes perfis específicos."}
                      </FieldDescription>
                    </Field>

                    {f.versoes.length > 1 && (
                      <Field className="lg:col-span-2">
                        <FieldLabel>Versão do prompt do sistema</FieldLabel>
                        <div className="space-y-2 pt-1">
                          {f.versoes.map((v) => {
                            const emUso = v.versao === f.versaoEmUso;
                            const escolhida = v.versao === f.versaoPrompt;
                            return (
                              <label
                                key={v.versao}
                                className={`flex cursor-pointer gap-2 rounded-md border p-2 text-xs ${
                                  emUso ? "border-primary bg-primary/5" : ""
                                }`}
                              >
                                <input
                                  type="radio"
                                  className="mt-0.5"
                                  name={`versao-${f.chave}`}
                                  checked={emUso}
                                  onChange={() =>
                                    salvar.mutate({
                                      chave: f.chave,
                                      body: { versaoPrompt: v.versao },
                                    })
                                  }
                                />
                                <span className="flex-1">
                                  <span className="font-medium">{v.versao}</span>
                                  {emUso && !escolhida && (
                                    <span className="ml-2 text-muted-foreground">
                                      (em uso por ser a mais recente)
                                    </span>
                                  )}
                                  <span className="block text-muted-foreground">
                                    {v.resumo}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </Field>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      disabled={!termosAceitos || restaurar.isPending}
                      onClick={() => restaurar.mutate(f.chave)}
                    >
                      Restaurar textos do padrão do sistema
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pré-visualizar e testar o prompt (painel compacto colapsável).
 */
function PromptPreviaETeste() {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<{
    texto: string;
    ferramentas: string[];
  } | null>(null);

  const verPrevia = useMutation({
    mutationFn: () =>
      apiFetch<{ prompt: string; ferramentas: string[] }>(
        "/agente/prompt/previa",
        { method: "POST", body: {} },
      ),
    onSuccess: (r) => setPrevia(r.prompt),
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao montar o prompt",
      ),
  });

  const testar = useMutation({
    mutationFn: () =>
      apiFetch<{ resposta: string; ferramentasChamadas: string[] }>(
        "/agente/prompt/testar",
        { method: "POST", body: { pergunta: pergunta.trim() } },
      ),
    onSuccess: (r) =>
      setResposta({ texto: r.resposta, ferramentas: r.ferramentasChamadas }),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao testar"),
  });

  if (!aberto) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          <span className="text-xs font-semibold">Diagnóstico & Teste de Prompts</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAberto(true)}
        >
          Abrir Painel de Testes
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Diagnóstico & Teste de Prompts</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAberto(false)}
        >
          Fechar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={verPrevia.isPending}
          onClick={() => verPrevia.mutate()}
        >
          Ver prompt montado (Sem custo)
        </Button>
      </div>

      {previa && (
        <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap border">
          {previa}
        </pre>
      )}

      <div className="space-y-2 border-t pt-3">
        <FieldLabel htmlFor="teste-pergunta">
          Testar com uma pergunta real
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id="teste-pergunta"
            className="min-w-64 flex-1"
            placeholder="Quanto o Mercado Silva está devendo?"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
          />
          <Button
            size="sm"
            disabled={testar.isPending || pergunta.trim().length < 3}
            onClick={() => testar.mutate()}
          >
            {testar.isPending ? "Perguntando..." : "Testar"}
          </Button>
        </div>
        <FieldDescription>
          Executa uma chamada real ao provedor para testar a resposta do assistente.
        </FieldDescription>

        {resposta && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium">Resposta gerada:</p>
            <p className="text-xs whitespace-pre-wrap">{resposta.texto}</p>
            {resposta.ferramentas.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Ferramentas consultadas: <code>{resposta.ferramentas.join(", ")}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

