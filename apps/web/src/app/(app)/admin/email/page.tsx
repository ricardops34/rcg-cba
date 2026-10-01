"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  EmailConfiguracao,
  EmailConfiguracaoUpdate,
  EmailTesteResultado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send } from "lucide-react";

type Form = Omit<EmailConfiguracaoUpdate, "senha" | "porta"> & { senha: string; porta: string };

const FUNCIONALIDADES: Array<{ chave: keyof Form; rotulo: string; detalhe: string }> = [
  { chave: "documentos", rotulo: "DANFE e XML", detalhe: "2ª via da nota, na Posição do Cliente e em Notas de Saída." },
  { chave: "boleto", rotulo: "Boleto", detalhe: "2ª via do boleto, atualizado ou original." },
  { chave: "cobranca", rotulo: "Cobrança", detalhe: "Títulos vencidos com boletos e DANFEs anexados." },
  { chave: "senhaProvisoria", rotulo: "Senha provisória", detalhe: "Ao criar o acesso do vendedor ou reenviar a senha." },
];

/**
 * Administração > E-mail: os parâmetros SMTP_* e EMAIL_* editados juntos —
 * mesmo desenho do SMS, sem tabela própria (decisão do usuário, 01/10/2026).
 * A senha do SMTP não volta da API; o campo só troca a atual quando
 * preenchido. O teste manda para o e-mail de quem está logado.
 */
export default function EmailPage() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["email", "configuracao"],
    queryFn: () => apiFetch<EmailConfiguracao>("/email/configuracao"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">E-mail</h1>
        <p className="text-sm text-muted-foreground">
          Servidor de envio (SMTP) e o que a empresa manda por e-mail aos clientes e vendedores.
        </p>
      </div>
      {isLoading || !cfg ? (
        <Card>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : (
        // A chave refaz o formulário quando a configuração gravada muda.
        <FormularioEmail key={JSON.stringify(cfg)} cfg={cfg} queryClient={queryClient} />
      )}
    </div>
  );
}

function FormularioEmail({
  cfg,
  queryClient,
}: {
  cfg: EmailConfiguracao;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [form, setForm] = useState<Form>(() => ({
    ativo: cfg.ativo,
    host: cfg.host,
    porta: cfg.porta ? String(cfg.porta) : "",
    seguro: cfg.seguro,
    usuario: cfg.usuario,
    senha: "",
    remetente: cfg.remetente,
    documentos: cfg.documentos,
    boleto: cfg.boleto,
    cobranca: cfg.cobranca,
    senhaProvisoria: cfg.senhaProvisoria,
  }));
  const muda = <K extends keyof Form>(chave: K, valor: Form[K]) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<EmailConfiguracao>("/email/configuracao", {
        method: "PUT",
        body: {
          ...form,
          porta: form.porta ? Number(form.porta) : null,
          senha: form.senha || undefined,
        },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["email", "configuracao"], atualizado);
      void queryClient.invalidateQueries({ queryKey: ["email", "disponivel"] });
      toast.success("Configuração de e-mail salva");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const testar = useMutation({
    mutationFn: () => apiFetch<EmailTesteResultado>("/email/teste", { method: "POST" }),
    onSuccess: (r) => toast.success(`E-mail de teste enviado para ${r.enviadoPara}`),
    // O erro do servidor de e-mail vem inteiro: é o que se precisa ler.
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha no envio de teste", {
        duration: 15_000,
      }),
  });

  // Porta e criptografia que não combinam: o erro mais comum (1º/10/2026).
  const avisoPorta =
    form.porta === "587" && form.seguro
      ? "Porta 587 trabalha com SSL/TLS direto desligado (a criptografia entra depois, STARTTLS)."
      : form.porta === "465" && !form.seguro
        ? "Porta 465 pede SSL/TLS direto ligado."
        : null;

  return (
    <Card>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Envio de e-mail</p>
            <Badge variant={cfg.habilitado ? "default" : "secondary"}>
              {cfg.habilitado ? "Habilitado" : "Desabilitado"}
            </Badge>
            {cfg.usaServidorDoAmbiente && (
              <span className="text-xs text-muted-foreground">usando o servidor padrão da plataforma</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Habilitado</FieldLabel>
              <FieldDescription>
                Liga o envio de e-mail nesta empresa (EMAIL_ATIVO). Os botões de e-mail só aparecem
                com ele ligado, um servidor configurado e a funcionalidade ligada.
              </FieldDescription>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => muda("ativo", v)} />
          </div>

          <div className="space-y-3">
            <FieldLabel>Servidor (SMTP)</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-host" className="text-xs">Servidor</FieldLabel>
                <Input
                  id="smtp-host"
                  value={form.host}
                  placeholder="mail.suaempresa.com.br — vazio usa o servidor padrão"
                  onChange={(e) => muda("host", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-porta" className="text-xs">Porta</FieldLabel>
                <Input
                  id="smtp-porta"
                  inputMode="numeric"
                  value={form.porta}
                  placeholder="587"
                  onChange={(e) => muda("porta", e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <FieldLabel>SSL/TLS direto</FieldLabel>
                <FieldDescription>Ligado para a porta 465; desligado para a 587.</FieldDescription>
              </div>
              <Switch checked={form.seguro} onCheckedChange={(v) => muda("seguro", v)} />
            </div>
            {avisoPorta && <p className="text-xs text-amber-600 dark:text-amber-400">{avisoPorta}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-usuario" className="text-xs">Usuário</FieldLabel>
                <Input
                  id="smtp-usuario"
                  autoComplete="off"
                  value={form.usuario}
                  onChange={(e) => muda("usuario", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-senha" className="text-xs">Senha</FieldLabel>
                <Input
                  id="smtp-senha"
                  type="password"
                  autoComplete="new-password"
                  value={form.senha}
                  placeholder={cfg.senhaPreenchida ? "•••••••• (preenchida — digite só para trocar)" : ""}
                  onChange={(e) => muda("senha", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="smtp-remetente" className="text-xs">Remetente</FieldLabel>
              <Input
                id="smtp-remetente"
                value={form.remetente}
                placeholder="Empresa <naoresponda@suaempresa.com.br>"
                onChange={(e) => muda("remetente", e.target.value)}
              />
              <FieldDescription>
                Muitos servidores só aceitam remetente igual ao usuário.
              </FieldDescription>
            </div>
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

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={testar.isPending}
              title="Usa a configuração gravada — salve antes de testar uma alteração"
              onClick={() => testar.mutate()}
            >
              {testar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar e-mail de teste
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
