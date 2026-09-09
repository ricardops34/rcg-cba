"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WhatsappDestinatario,
  WhatsappRecado,
} from "@plataforma/contracts";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Send, Users } from "lucide-react";

const LIMITE_TEXTO = 1000;

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const mensagemErro = (erro: unknown, padrao: string) =>
  erro instanceof ApiError ? erro.message : padrao;

/**
 * Recado interno pelo número da empresa.
 *
 * **Não é disparo em massa.** Alcança só quem tem cadastro de vendedor, e a
 * tela existe justamente para o envio ser deliberado: quem manda vê a lista
 * nominal de quem vai receber antes de apertar o botão. Errar por WhatsApp não
 * tem desfazer.
 */
export default function RecadosPage() {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [agendarPara, setAgendarPara] = useState("");

  const { data: pessoas, isLoading } = useQuery({
    queryKey: ["whatsapp-recado-destinatarios"],
    queryFn: () =>
      apiFetch<WhatsappDestinatario[]>("/whatsapp/recados/destinatarios"),
  });

  const { data: recados } = useQuery({
    queryKey: ["whatsapp-recados"],
    queryFn: () => apiFetch<WhatsappRecado[]>("/whatsapp/recados"),
  });

  const alcancaveis = useMemo(
    () => (pessoas ?? []).filter((p) => p.alcancavel),
    [pessoas],
  );
  const semTelefone = useMemo(
    () => (pessoas ?? []).filter((p) => !p.alcancavel),
    [pessoas],
  );

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappRecado>("/whatsapp/recados", {
        method: "POST",
        body: {
          texto: texto.trim(),
          vendedorIds: selecionados,
          enviarEm: agendarPara ? new Date(agendarPara).toISOString() : null,
        },
      }),
    onSuccess: (recado) => {
      setTexto("");
      setSelecionados([]);
      setAgendarPara("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-recados"] });
      toast.success(
        recado.enviarEm
          ? `Recado agendado para ${formatarDataHora(recado.enviarEm)}.`
          : `Recado enviado a ${recado.enviados} pessoa(s).` +
              (recado.falhas ? ` ${recado.falhas} não recebeu.` : ""),
      );
    },
    onError: (erro) => toast.error(mensagemErro(erro, "Erro ao enviar")),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/recados/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-recados"] });
      toast.success("Recado cancelado.");
    },
    onError: (erro) => toast.error(mensagemErro(erro, "Erro ao cancelar")),
  });

  const alternar = (id: string) =>
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id],
    );

  const todosMarcados =
    alcancaveis.length > 0 && selecionados.length === alcancaveis.length;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Carregando a equipe...</p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Recado para a equipe</h1>
        <p className="text-sm text-muted-foreground">
          Uma mensagem pelo WhatsApp da empresa para quem trabalha aqui. Não
          alcança cliente — para falar com cliente, use o Atendimento.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              Quem vai receber
              <Badge variant="secondary">{selecionados.length}</Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 pt-4">
            {alcancaveis.length > 0 && (
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={todosMarcados}
                  onCheckedChange={() =>
                    setSelecionados(
                      todosMarcados ? [] : alcancaveis.map((p) => p.vendedorId),
                    )
                  }
                />
                Selecionar todos ({alcancaveis.length})
              </label>
            )}

            <div className="max-h-80 space-y-1 overflow-y-auto">
              {alcancaveis.map((p) => (
                <label
                  key={p.vendedorId}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selecionados.includes(p.vendedorId)}
                    onCheckedChange={() => alternar(p.vendedorId)}
                  />
                  <span className="flex-1">{p.nome}</span>
                  {p.superior && (
                    <Badge variant="outline" className="text-xs">
                      equipe
                    </Badge>
                  )}
                </label>
              ))}
            </div>

            {/*
              Quem não tem telefone aparece, desmarcável e com o motivo.
              Esconder faria "mandei para a equipe" omitir quem ficou de fora —
              que é exatamente o que ninguém descobre até fazer falta.
            */}
            {semTelefone.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  Sem telefone no cadastro, não recebem:
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {semTelefone.map((p) => p.nome).join(", ")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>O recado</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <Field>
              <FieldLabel htmlFor="texto">Mensagem</FieldLabel>
              <Textarea
                id="texto"
                rows={6}
                maxLength={LIMITE_TEXTO}
                placeholder="Amanhã a reunião começa às 8h, na sala da frente."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <FieldDescription>
                Vai assinada com o seu nome. {LIMITE_TEXTO - texto.length}{" "}
                caracteres restantes.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="agendar">Enviar depois (opcional)</FieldLabel>
              <Input
                id="agendar"
                type="datetime-local"
                className="max-w-60"
                value={agendarPara}
                onChange={(e) => setAgendarPara(e.target.value)}
              />
              <FieldDescription>
                Em branco, sai agora. Agendado, dá para cancelar até a hora.
              </FieldDescription>
            </Field>

            <Button
              className="w-full"
              disabled={
                enviar.isPending ||
                selecionados.length === 0 ||
                texto.trim().length < 3
              }
              onClick={() => enviar.mutate()}
            >
              <Send className="size-4" />
              {enviar.isPending
                ? "Enviando..."
                : agendarPara
                  ? `Agendar para ${selecionados.length} pessoa(s)`
                  : `Enviar agora a ${selecionados.length} pessoa(s)`}
            </Button>
          </CardContent>
        </Card>
      </div>

      {recados && recados.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Meus recados</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            {recados.map((r) => (
              <div key={r.id} className="space-y-1.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.status === "erro"
                        ? "destructive"
                        : r.status === "pendente"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {r.status === "pendente" && r.enviarEm
                      ? `agendado ${formatarDataHora(r.enviarEm)}`
                      : r.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatarDataHora(r.criadoEm)} · {r.enviados} enviado(s)
                    {r.falhas > 0 && ` · ${r.falhas} falha(s)`}
                  </span>
                  {r.status === "pendente" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7"
                      onClick={() => cancelar.mutate(r.id)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>

                <p className="text-sm">{r.texto}</p>

                <p className="text-xs text-muted-foreground">
                  {r.destinatarios.map((d) => d.nome).join(", ")}
                </p>

                {r.destinatarios
                  .filter((d) => d.erro)
                  .map((d) => (
                    <p key={d.nome} className="text-xs text-destructive">
                      {d.nome}: {d.erro}
                    </p>
                  ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
