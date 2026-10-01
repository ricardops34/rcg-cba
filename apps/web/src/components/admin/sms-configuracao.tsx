"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SmsConfiguracao, SmsConfiguracaoUpdate } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Copy, Loader2 } from "lucide-react";

const numero = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

type Form = Omit<SmsConfiguracaoUpdate, "token"> & { token: string };

const FUNCIONALIDADES: Array<{ chave: keyof Form; rotulo: string; detalhe: string }> = [
  { chave: "boleto", rotulo: "Boleto", detalhe: "Valor, vencimento e linha digitável na 2ª via do título." },
  { chave: "cobranca", rotulo: "Cobrança", detalhe: "Quantidade e total dos vencidos, na Posição do Cliente." },
  { chave: "mensagemLivre", rotulo: "Mensagem livre", detalhe: "O vendedor escreve, no Histórico de atendimento." },
  { chave: "senhaProvisoria", rotulo: "Senha provisória", detalhe: "Junto do e-mail, ao criar o acesso do vendedor." },
];

/**
 * Configuração do SMS — os parâmetros SMS_* editados juntos (decisão do
 * usuário, 01/10/2026: ficam em Parâmetros, sem tabela própria). O token não
 * volta da API; o campo só troca o atual quando é preenchido.
 */
export function SmsConfiguracaoCard() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["sms", "configuracao"],
    queryFn: () => apiFetch<SmsConfiguracao>("/sms/configuracao"),
  });
  if (isLoading || !cfg) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }
  // A chave refaz o formulário quando a configuração gravada muda (depois de
  // salvar), em vez de copiar o valor para o estado num efeito.
  return <FormularioSms key={JSON.stringify({ ...cfg, saldo: null })} cfg={cfg} queryClient={queryClient} />;
}

function FormularioSms({
  cfg,
  queryClient,
}: {
  cfg: SmsConfiguracao;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [form, setForm] = useState<Form>(() => ({
    ativo: cfg.ativo,
    token: "",
    boleto: cfg.boleto,
    cobranca: cfg.cobranca,
    mensagemLivre: cfg.mensagemLivre,
    senhaProvisoria: cfg.senhaProvisoria,
    avisoVencimento: cfg.avisoVencimento,
    avisoDiasAntes: cfg.avisoDiasAntes,
    avisoDiasDepois: cfg.avisoDiasDepois,
  }));

  const salvar = useMutation({
    mutationFn: (dados: Form) =>
      apiFetch<SmsConfiguracao>("/sms/configuracao", {
        method: "PUT",
        body: { ...dados, token: dados.token.trim() || undefined },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["sms", "configuracao"], atualizado);
      // Os botões de SMS da tela dependem disto.
      void queryClient.invalidateQueries({ queryKey: ["sms", "disponivel"] });
      toast.success("Configuração do SMS salva");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("URL copiada");
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente");
    }
  };

  const muda = <K extends keyof Form>(chave: K, valor: Form[K]) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  return (
    <Card>
      <CardContent className="space-y-5">
        {/* Situação e saldo */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">Envio de SMS (iAgente)</p>
              <Badge variant={cfg.habilitado ? "default" : "secondary"}>
                {cfg.habilitado ? "Habilitado" : "Desabilitado"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Os botões de SMS só aparecem com o SMS habilitado, o token preenchido e a
              funcionalidade ligada.
            </p>
          </div>
          {cfg.tokenPreenchido && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Saldo disponível</p>
              {cfg.erroSaldo ? (
                <p className="max-w-xs text-xs text-destructive">{cfg.erroSaldo}</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums">{numero(cfg.saldo?.disponivel)}</p>
                  <p className="text-xs text-muted-foreground">
                    Consumo no mês: {numero(cfg.saldo?.consumoMes)}
                    {cfg.saldo?.modalidade === "POS" ? " · pós-pago" : ""}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate(form);
          }}
        >
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Habilitado</FieldLabel>
              <FieldDescription>Liga o envio de SMS nesta empresa (SMS_ATIVO).</FieldDescription>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => muda("ativo", v)} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="sms-token">Token da iAgente (SMS_TOKEN)</FieldLabel>
            <Input
              id="sms-token"
              type="password"
              autoComplete="off"
              value={form.token}
              placeholder={cfg.tokenPreenchido ? "•••••••• (preenchido — digite só para trocar)" : "sk_live_..."}
              onChange={(e) => muda("token", e.target.value)}
            />
            <FieldDescription>
              Gerado no painel da iAgente, com os escopos de envio e de consulta de saldo.
            </FieldDescription>
          </div>

          <div className="space-y-2">
            <FieldLabel>Funcionalidades</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {FUNCIONALIDADES.map((f) => (
                <label
                  key={f.chave}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <span>
                    <span className="block text-sm font-medium">{f.rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{f.detalhe}</span>
                  </span>
                  <Switch
                    checked={Boolean(form[f.chave])}
                    onCheckedChange={(v) => muda(f.chave, v as never)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Aviso automático de vencimento</span>
                <span className="block text-xs text-muted-foreground">
                  Manda SMS ao cliente sem ninguém clicar — de segunda a sábado, das 8h às 18h, um
                  aviso de cada tipo por título.
                </span>
              </span>
              <Switch
                checked={form.avisoVencimento}
                onCheckedChange={(v) => muda("avisoVencimento", v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <div className="space-y-1">
                <FieldLabel htmlFor="sms-antes">Dias antes</FieldLabel>
                <Input
                  id="sms-antes"
                  type="number"
                  min={0}
                  max={30}
                  value={form.avisoDiasAntes}
                  onChange={(e) => muda("avisoDiasAntes", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="sms-depois">Dias depois</FieldLabel>
                <Input
                  id="sms-depois"
                  type="number"
                  min={0}
                  max={30}
                  value={form.avisoDiasDepois}
                  onChange={(e) => muda("avisoDiasDepois", Number(e.target.value))}
                />
              </div>
            </div>
            <FieldDescription>0 desliga o aviso daquele lado.</FieldDescription>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>

        <div className="space-y-1.5 border-t pt-4">
          <FieldLabel>URL do webhook (cadastre no painel da iAgente)</FieldLabel>
          <div className="flex gap-2">
            <Input readOnly value={cfg.webhookUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copiar(cfg.webhookUrl)}
              aria-label="Copiar URL"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            É por ela que chegam o status de entrega e as respostas dos clientes, vinculadas ao SMS
            enviado. Não compartilhe: quem tem a URL consegue gravar respostas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
