"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PROVEDORES,
  SYSTEM_PROMPT_PADRAO,
  type AgenteConfig,
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
import { Plug } from "lucide-react";


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
   * xAI apontando para um modelo Claude seria uma configuração que nunca
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
                    frequente desta tela, e cada botão já mostra se aquele
                    provedor tem chave gravada. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(PROVEDORES) as ProvedorIa[]).map((p) => {
                    const cred = config.credenciais.find((c) => c.provedor === p);
                    const ativo = form.provedor === p;
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
                          {cred ? `chave •••• ${cred.apiKeyUltimos4}` : "sem chave"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <FieldDescription>
                  A chave de cada provedor fica gravada separadamente — trocar
                  de provedor não apaga a chave do outro.{" "}
                  <a
                    href={info.urlChave}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Obter chave da {info.rotulo}
                  </a>
                </FieldDescription>
              </Field>

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
                    {/* Aviso de chave trocada: gsk_ na Anthropic e sk-ant- na
                        Groq são o erro mais provável aqui. */}
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
                  {modelos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <FieldDescription>
                  Use &quot;Testar conexão&quot; para listar os modelos que a sua
                  conta realmente tem.
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
              <Field>
                <FieldLabel htmlFor="maxTokens">Tamanho máximo da resposta</FieldLabel>
                <Input
                  id="maxTokens"
                  type="number"
                  min={256}
                  max={32000}
                  value={form.maxTokens}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))
                  }
                />
              </Field>
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
