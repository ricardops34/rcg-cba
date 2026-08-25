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
  ExternalLink,
  Plug,
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
    <Card>
      <CardContent className="pt-6">
        {/* Uma aba geral e uma por LLM.
            A separação não é estética: o que está em "Configurações gerais"
            define o que o agente **é** — nome, regras, ferramentas — e
            sobrevive à troca de modelo. Cada aba de LLM guarda credencial e
            ajustes daquele provedor, que são descartáveis. Antes tudo dividia
            a mesma tela, e trocar de provedor parecia reconfigurar o agente
            inteiro. */}
        <Tabs defaultValue="geral">
          <TabsList>
            <TabsTrigger value="geral">Configurações gerais</TabsTrigger>
            <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
            {(Object.keys(PROVEDORES) as ProvedorIa[]).map((p) => (
              <TabsTrigger key={p} value={p}>
                {PROVEDORES[p].rotulo}
                {form.provedor === p ? " ✓" : ""}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ---------------- geral ---------------- */}
          <TabsContent value="geral" className="pt-4">
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Identidade</FieldLegend>
                <FieldGroup>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
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
                      onde a equipe descobre o que dá para pedir. Não vai para o
                      modelo: é texto seu, para quem vai perguntar. Em branco,
                      usa o exemplo acima.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>Modelo em uso</FieldLabel>
                    <FieldDescription>
                      {PROVEDORES[form.provedor].rotulo} —{" "}
                      <code>{form.modelo}</code>. Para trocar, abra a aba do
                      provedor desejado.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Prompt base</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="systemPrompt">
                    Instruções do agente
                  </FieldLabel>
                  <Textarea
                    id="systemPrompt"
                    rows={10}
                    value={form.systemPrompt}
                    placeholder={SYSTEM_PROMPT_PADRAO}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                    }
                  />
                  <FieldDescription>
                    Define o tom e as regras de resposta, e vale para qualquer
                    provedor. O sistema acrescenta automaticamente o contexto da
                    sessão (usuário, data e quais ferramentas ele pode usar) —
                    não é preciso repetir isso aqui.
                  </FieldDescription>
                </Field>
              </FieldSet>


              <FieldSet>
                <FieldLegend>Limites</FieldLegend>
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
                    {/* Medido: com 5, uma pergunta que encadeia clientes e
                        títulos morre no limite antes de o Codex escrever a
                        resposta. */}
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
            </FieldGroup>
          </TabsContent>

          {/* ---------------- ferramentas ---------------- */}
          <TabsContent value="ferramentas" className="pt-4">
            <FerramentasSection />
          </TabsContent>

          {/* ---------------- uma aba por LLM ---------------- */}
          {(Object.keys(PROVEDORES) as ProvedorIa[]).map((p) => (
            <TabsContent key={p} value={p} className="pt-4">
              <ProvedorTab
                provedor={p}
                emUso={form.provedor === p}
                config={config}
                form={form}
                setForm={setForm}
                modelos={modelos}
                onUsar={() => usarProvedor(p)}
                onTestar={() => testar.mutate(p)}
                testando={testar.isPending}
                onMudou={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["agente-config"],
                  })
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
        >
          Salvar
        </Button>
      </CardFooter>
    </Card>
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
                credencial?.apiKeyPreenchida
                  ? `•••• ${credencial.apiKeyUltimos4} (gravada)`
                  : `Cole a chave da ${info.rotulo}`
              }
              onChange={(e) =>
                setForm((f) => ({ ...f, apiKey: e.target.value }))
              }
            />
            <FieldDescription>
              {!emUso ? (
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
            <Input
              id={`modelo-${provedor}`}
              list={`modelos-${provedor}`}
              disabled={!emUso}
              value={emUso ? form.modelo : (credencial?.modelo ?? info.modeloPadrao)}
              onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
            />
            <datalist id={`modelos-${provedor}`}>
              {/* O Codex não expõe endpoint de modelos: a lista dele vem fixa
                  dos contratos, conferida contra o backend. */}
              {(modelos.length && emUso ? modelos : (info.modelos ?? [])).map(
                (m) => (
                  <option key={m} value={m} />
                ),
              )}
            </datalist>
            <FieldDescription>
              {!emUso
                ? "Disponível quando este for o provedor em uso."
                : info.modelos
                  ? "Estes são os modelos que a assinatura ChatGPT aceita neste endpoint — os nomes da API pública (gpt-5, o4-mini…) são recusados aqui."
                  : 'Use "Testar conexão" para listar os modelos que a sua conta realmente tem.'}
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

  if (!ferramentas) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        O que o agente pode consultar e fazer. Desligar uma ferramenta a tira do
        catálogo enviado ao modelo — ele deixa de saber que ela existe, em vez
        de tentar e falhar.
      </p>

      {ferramentas.map((f) => (
        <div
          key={f.chave}
          className={`rounded-lg border p-3 ${f.ativa ? "" : "opacity-60"}`}
        >
          <div className="flex items-start gap-3">
            <Switch
              checked={f.ativa}
              onCheckedChange={(v) =>
                salvar.mutate({ chave: f.chave, body: { ativa: v } })
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-medium">{f.chave}</code>
                {f.escrita ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    grava (exige confirmação)
                  </span>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  exige <code>{f.permissao}</code>
                </span>
              </div>
            </div>
          </div>

          {/* Só faz sentido configurar o que está ligado; desligada, a
              ferramenta nem chega ao modelo. */}
          {f.ativa ? (
            <div className="grid grid-cols-1 gap-3 pt-3 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`desc-${f.chave}`}>
                  Descrição para o modelo
                </FieldLabel>
                <Textarea
                  id={`desc-${f.chave}`}
                  rows={3}
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
                  É este texto que ensina o modelo <strong>quando</strong> usar
                  a ferramenta. Apagar tudo volta ao padrão.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Perfis com direito de uso</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {(perfis?.data ?? []).map((p) => {
                    // O Administrador não entra na restrição: o servidor libera
                    // todas as ferramentas para ele, sempre. Um botão alternável
                    // aqui prometeria um controle que não existe.
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
                            ? "border-primary bg-primary/10 text-primary"
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
                    : "Marcar restringe ainda mais — nunca amplia: quem não tem a permissão continua sem acesso."}{" "}
                  O Administrador tem acesso a todas as ferramentas ativas,
                  sempre.
                </FieldDescription>
              </Field>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
