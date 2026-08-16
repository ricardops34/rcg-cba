"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { WhatsappConfig, WhatsappTransporte } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

/**
 * Configuração de WhatsApp da empresa. É o que a empresa decide; o número
 * conectado é de cada vendedor e fica em Comercial > Atendimento.
 */
export default function WhatsappConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-config"],
    queryFn: () => apiFetch<WhatsappConfig>("/whatsapp/config"),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }
  return <WhatsappConfigForm config={data} />;
}

const TRANSPORTES: {
  valor: WhatsappTransporte;
  rotulo: string;
  descricao: string;
}[] = [
  {
    valor: "zapo",
    rotulo: "Número do vendedor",
    descricao:
      "O vendedor conecta um aparelho lendo o QR, como no WhatsApp Web. Não é a API oficial do Meta — o número pode ser banido. Use chip dedicado, não o pessoal.",
  },
  {
    valor: "cloud_api",
    rotulo: "API oficial (Cloud API)",
    descricao:
      "Número dedicado da empresa, sem risco de banimento — mas ele deixa de funcionar no aplicativo comum, e falar com quem não escreveu antes exige modelo aprovado e pago.",
  },
];

function WhatsappConfigForm({ config }: { config: WhatsappConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ativo: config.ativo,
    transporte: config.transporte,
    workerUrl: config.workerUrl ?? "",
    retencaoDias: config.retencaoDias,
    dddPadrao: config.dddPadrao ?? "",
  });

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappConfig>("/whatsapp/config", {
        method: "PUT",
        body: {
          ativo: form.ativo,
          transporte: form.transporte,
          workerUrl: form.workerUrl.trim() || null,
          retencaoDias: form.retencaoDias,
          dddPadrao: form.dddPadrao.trim() || null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      toast.success("Configuração salva");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar"),
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Atendimento por WhatsApp</FieldLegend>
            <FieldGroup>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Ativo
              </label>
              <FieldDescription>
                Desligado, nenhum vendedor consegue conectar e a tela de
                Atendimento fica indisponível. As conversas já gravadas
                permanecem.
              </FieldDescription>

              <Field>
                <FieldLabel>Como o WhatsApp é conectado</FieldLabel>
                {/* Cartões em vez de select: a diferença entre os dois não é de
                    configuração, é de risco — e precisa estar visível na hora
                    de escolher, não escondida numa lista. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TRANSPORTES.map((t) => {
                    const ativo = form.transporte === t.valor;
                    return (
                      <button
                        key={t.valor}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, transporte: t.valor }))
                        }
                        className={`rounded-lg border p-3 text-left text-sm transition ${
                          ativo
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="font-medium">{t.rotulo}</div>
                        <div className="pt-1 text-xs text-muted-foreground">
                          {t.descricao}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {form.transporte === "zapo" ? (
                <Field>
                  <FieldLabel htmlFor="workerUrl">Endereço do serviço</FieldLabel>
                  <Input
                    id="workerUrl"
                    value={form.workerUrl}
                    placeholder="http://whatsapp-worker:3100"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, workerUrl: e.target.value }))
                    }
                  />
                  <FieldDescription>
                    As conexões de WhatsApp ficam de pé num serviço à parte, não
                    na API — cada sessão é uma conexão viva, e a API reinicia a
                    cada atualização. Sem este endereço, ninguém consegue parear.
                  </FieldDescription>
                </Field>
              ) : null}

              <Field>
                <FieldLabel htmlFor="dddPadrao">DDD padrão</FieldLabel>
                <Input
                  id="dddPadrao"
                  inputMode="numeric"
                  maxLength={2}
                  className="max-w-24"
                  placeholder="67"
                  value={form.dddPadrao}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dddPadrao: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
                <FieldDescription>
                  A maioria dos telefones do cadastro de clientes está gravada
                  sem DDD. Este é o DDD usado para completar o número ao
                  iniciar uma conversa a partir do cadastro. Em branco, o
                  sistema pede o número completo em vez de adivinhar — um DDD
                  errado manda a mensagem para um desconhecido.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Retenção</FieldLegend>
            <Field>
              <FieldLabel htmlFor="retencaoDias">
                Guardar conversas por (dias)
              </FieldLabel>
              <Input
                id="retencaoDias"
                type="number"
                min={0}
                max={3650}
                className="max-w-40"
                value={form.retencaoDias}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    retencaoDias: Number(e.target.value),
                  }))
                }
              />
              <FieldDescription>
                0 guarda indefinidamente. Conversa de cliente é dado pessoal de
                terceiro: guardar sem prazo faz a base crescer sem limite e o
                passivo junto.{" "}
                <span className="text-amber-600">
                  O expurgo automático ainda não está implementado — por
                  enquanto este valor registra a decisão.
                </span>
              </FieldDescription>
            </Field>
          </FieldSet>
        </FieldGroup>
      </CardContent>

      <CardFooter className="justify-end">
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
