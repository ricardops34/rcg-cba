"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PROVEDORES,
  SYSTEM_PROMPT_PADRAO,
  type AgenteConfig,
  type AgenteCredencial,
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

function AgenteConfigForm({ config }: { config: AgenteConfig }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    ativo: config.ativo,
    provedor: config.provedor,
    modelo: config.modelo,
    baseUrl: config.baseUrl,
    apiKey: "",
    systemPrompt: config.systemPrompt ?? "",
    temperatura: config.temperatura,
    maxTokens: config.maxTokens,
  });
  const [modelos, setModelos] = useState<string[]>([]);

  const info = PROVEDORES[form.provedor];
  /** Chave já gravada para o provedor selecionado — a base da troca em um clique. */
  const credencial = config.credenciais.find((c) => c.provedor === form.provedor);

  /**
   * Trocar de provedor troca endpoint e modelo junto: manter a baseUrl da
   * OpenAI apontando para um modelo Claude seria uma configuração que nunca
   * funciona. Se já houve uso daquele provedor, volta o modelo de antes.
   */
  const trocarProvedor = (novo: ProvedorIa) => {
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
          provedor: form.provedor,
          modelo: form.modelo,
          baseUrl: form.baseUrl,
          // Só manda a chave se o usuário digitou algo — vazio mantém a atual.
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          systemPrompt: form.systemPrompt || null,
          temperatura: form.temperatura,
          maxTokens: form.maxTokens,
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
    mutationFn: () =>
      apiFetch<{ ok: boolean; modelos: string[] }>("/agente/config/testar", {
        method: "POST",
        body: {
          provedor: form.provedor,
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
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Conexão</FieldLegend>
            <FieldGroup>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Agente ativo
              </label>
              <FieldDescription>
                Desligado, o ícone do assistente não aparece para ninguém e as
                chamadas ao provedor são recusadas.
              </FieldDescription>

              <Field>
                <FieldLabel>Provedor</FieldLabel>
                {/* Botões em vez de select: trocar de provedor é a ação mais
                    frequente desta tela, e cada botão já mostra o estado da
                    credencial daquele provedor — chave gravada, ou conta
                    conectada no caso do OAuth. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(PROVEDORES) as ProvedorIa[]).map((p) => {
                    const cred = config.credenciais.find((c) => c.provedor === p);
                    const ativo = form.provedor === p;
                    const oauth = PROVEDORES[p].autenticacao === "oauth";
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => trocarProvedor(p)}
                        className={`rounded-lg border p-2 text-left text-sm transition ${
                          ativo
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="font-medium">{PROVEDORES[p].rotulo}</div>
                        <div className="pt-0.5 text-xs text-muted-foreground">
                          {oauth
                            ? cred?.conectado
                              ? `conectado${cred.contaEmail ? ` — ${cred.contaEmail}` : ""}`
                              : "não conectado"
                            : cred?.apiKeyPreenchida
                              ? `chave •••• ${cred.apiKeyUltimos4}`
                              : "sem chave"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <FieldDescription>
                  A credencial de cada provedor fica gravada separadamente —
                  trocar de provedor não apaga a do outro.{" "}
                  <a
                    href={info.urlChave}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {info.autenticacao === "oauth"
                      ? `Sobre o ${info.rotulo}`
                      : `Obter chave da ${info.rotulo}`}
                  </a>
                </FieldDescription>
              </Field>

              {info.advertencia ? (
                <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{info.advertencia}</p>
                </div>
              ) : null}

              {info.autenticacao === "oauth" ? (
                <ConexaoOauth
                  credencial={credencial}
                  rotulo={info.rotulo}
                  onMudou={() =>
                    void queryClient.invalidateQueries({
                      queryKey: ["agente-config"],
                    })
                  }
                />
              ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="apiKey">Chave de API</FieldLabel>
                  <PasswordInput
                    id="apiKey"
                    value={form.apiKey}
                    placeholder={
                      credencial
                        ? `•••• ${credencial.apiKeyUltimos4} (gravada)`
                        : `Cole a chave da ${info.rotulo}`
                    }
                    onChange={(e) =>
                      setForm((f) => ({ ...f, apiKey: e.target.value }))
                    }
                  />
                  <FieldDescription>
                    {/* Aviso de chave trocada: colar a chave `sk-ant-` da
                        Anthropic no campo da OpenAI (e vice-versa) é o erro
                        mais provável aqui. */}
                    {form.apiKey &&
                    info.prefixoChave &&
                    !form.apiKey.startsWith(info.prefixoChave) ? (
                      <span className="text-amber-600">
                        Esta chave não começa com{" "}
                        <code>{info.prefixoChave}</code> — confira se ela é
                        mesmo da {info.rotulo}.
                      </span>
                    ) : (
                      "Em branco mantém a chave atual. Ela nunca é exibida de volta."
                    )}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="baseUrl">Endpoint</FieldLabel>
                  <Input
                    id="baseUrl"
                    value={form.baseUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, baseUrl: e.target.value }))
                    }
                  />
                </Field>
              </div>
              )}

              <Field>
                <FieldLabel htmlFor="modelo">Modelo</FieldLabel>
                <Input
                  id="modelo"
                  list="modelos-disponiveis"
                  value={form.modelo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modelo: e.target.value }))
                  }
                />
                <datalist id="modelos-disponiveis">
                  {/* O Codex não expõe endpoint de modelos: a lista dele vem
                      fixa dos contratos, conferida contra o backend. */}
                  {(modelos.length ? modelos : (info.modelos ?? [])).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <FieldDescription>
                  {info.modelos
                    ? "Estes são os modelos que a assinatura ChatGPT aceita neste endpoint — os nomes da API pública (gpt-5, o4-mini…) são recusados aqui."
                    : 'Use "Testar conexão" para listar os modelos que a sua conta realmente tem.'}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Personalidade</FieldLegend>
            <Field>
              <FieldLabel htmlFor="systemPrompt">Instruções do agente</FieldLabel>
              <Textarea
                id="systemPrompt"
                rows={8}
                value={form.systemPrompt}
                placeholder={SYSTEM_PROMPT_PADRAO}
                onChange={(e) =>
                  setForm((f) => ({ ...f, systemPrompt: e.target.value }))
                }
              />
              <FieldDescription>
                Define o tom e as regras de resposta. O sistema acrescenta
                automaticamente o contexto da sessão (usuário, data e quais
                ferramentas ele pode usar) — não é preciso repetir isso aqui.
              </FieldDescription>
            </Field>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Ajustes</FieldLegend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* A Anthropic removeu `temperature` nos modelos atuais — enviá-lo
                  devolve 400. Esconder o controle é melhor que deixar o
                  usuário ajustar algo que quebraria a chamada. */}
              {info.aceitaTemperatura ? (
                <Field>
                  <FieldLabel htmlFor="temperatura">
                    Temperatura: {form.temperatura.toFixed(2)}
                  </FieldLabel>
                  <input
                    id="temperatura"
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
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
                    Baixa (0–0,4) para respostas previsíveis sobre dados; alta
                    para texto mais criativo. Para consulta de números, mantenha
                    baixa.
                  </FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel>Temperatura</FieldLabel>
                  <FieldDescription>
                    Os modelos atuais da {info.rotulo} não aceitam o parâmetro de
                    temperatura — o controle de profundidade da resposta é feito
                    pelo próprio modelo. Ajuste o comportamento pelas instruções
                    acima.
                  </FieldDescription>
                </Field>
              )}
              {/* O backend do Codex recusa `max_output_tokens` (400
                  "Unsupported parameter") — quem limita o tamanho lá é a
                  própria assinatura. Mostrar o campo prometeria um controle
                  que não existe. */}
              {form.provedor === "codex" ? (
                <Field>
                  <FieldLabel>Tamanho máximo da resposta</FieldLabel>
                  <FieldDescription>
                    O Codex não aceita limite de tokens por requisição — o teto
                    é o da sua assinatura ChatGPT.
                  </FieldDescription>
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="maxTokens">
                    Tamanho máximo da resposta
                  </FieldLabel>
                  <Input
                    id="maxTokens"
                    type="number"
                    min={256}
                    max={32000}
                    value={form.maxTokens}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxTokens: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              )}
            </div>
          </FieldSet>
        </FieldGroup>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => testar.mutate()}
          disabled={testar.isPending}
        >
          <Plug className="size-4" />
          Testar conexão
        </Button>
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
