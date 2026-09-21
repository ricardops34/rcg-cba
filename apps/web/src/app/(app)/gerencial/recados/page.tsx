"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WhatsappDestinatario,
  WhatsappRecado,
  WhatsappRecadoRecebido,
} from "@plataforma/contracts";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Inbox,
  MessageSquare,
  Pencil,
  Send,
  SendHorizontal,
  Trash2,
  Users,
} from "lucide-react";

const LIMITE_TEXTO = 1000;

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const mensagemErro = (erro: unknown, padrao: string) =>
  erro instanceof ApiError ? erro.message : padrao;

export default function RecadosPage() {
  const queryClient = useQueryClient();

  // Formulário de criação
  const [texto, setTexto] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [agendarPara, setAgendarPara] = useState("");
  const [enviarPlataforma, setEnviarPlataforma] = useState(true);
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(true);

  // Estado do Modal de Edição
  const [recadoParaEditar, setRecadoParaEditar] =
    useState<WhatsappRecado | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [editAgendarPara, setEditAgendarPara] = useState("");
  const [editSelecionados, setEditSelecionados] = useState<string[]>([]);
  const [editEnviarPlataforma, setEditEnviarPlataforma] = useState(true);
  const [editEnviarWhatsapp, setEditEnviarWhatsapp] = useState(true);

  // Consultas
  const { data: pessoas, isLoading: carregandoPessoas } = useQuery({
    queryKey: ["whatsapp-recado-destinatarios"],
    queryFn: () =>
      apiFetch<WhatsappDestinatario[]>("/whatsapp/recados/destinatarios"),
  });

  const { data: recadosEnviados } = useQuery({
    queryKey: ["whatsapp-recados"],
    queryFn: () => apiFetch<WhatsappRecado[]>("/whatsapp/recados"),
  });

  const { data: recadosRecebidos } = useQuery({
    queryKey: ["whatsapp-recados-recebidos"],
    queryFn: () =>
      apiFetch<WhatsappRecadoRecebido[]>("/whatsapp/recados/recebidos"),
  });

  const alcancaveis = useMemo(
    () => (pessoas ?? []).filter((p) => p.alcancavel),
    [pessoas],
  );
  const semTelefone = useMemo(
    () => (pessoas ?? []).filter((p) => !p.alcancavel),
    [pessoas],
  );

  const naoLidosCount = useMemo(
    () => (recadosRecebidos ?? []).filter((r) => !r.lidoEm).length,
    [recadosRecebidos],
  );

  // Mutações
  const enviar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappRecado>("/whatsapp/recados", {
        method: "POST",
        body: {
          texto: texto.trim(),
          vendedorIds: selecionados,
          enviarEm: agendarPara ? new Date(agendarPara).toISOString() : null,
          enviarPlataforma,
          enviarWhatsapp,
        },
      }),
    onSuccess: (recado) => {
      setTexto("");
      setSelecionados([]);
      setAgendarPara("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-recados"] });
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-recados-recebidos"],
      });
      toast.success(
        recado.enviarEm
          ? `Recado agendado para ${formatarDataHora(recado.enviarEm)}.`
          : `Recado enviado para ${recado.destinatarios.length} pessoa(s).`,
      );
    },
    onError: (erro) => toast.error(mensagemErro(erro, "Erro ao enviar")),
  });

  const editar = useMutation({
    mutationFn: () => {
      if (!recadoParaEditar) throw new Error("Sem recado selecionado");
      return apiFetch<WhatsappRecado>(
        `/whatsapp/recados/${recadoParaEditar.id}`,
        {
          method: "PUT",
          body: {
            texto: editTexto.trim(),
            vendedorIds: editSelecionados,
            enviarEm: editAgendarPara
              ? new Date(editAgendarPara).toISOString()
              : null,
            enviarPlataforma: editEnviarPlataforma,
            enviarWhatsapp: editEnviarWhatsapp,
          },
        },
      );
    },
    onSuccess: () => {
      setRecadoParaEditar(null);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-recados"] });
      toast.success("Recado agendado atualizado com sucesso!");
    },
    onError: (erro) => toast.error(mensagemErro(erro, "Erro ao editar recado")),
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

  const marcarLido = useMutation({
    mutationFn: (recadoId: string) =>
      apiFetch(`/whatsapp/recados/${recadoId}/lido`, { method: "PATCH" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-recados-recebidos"],
      });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-recados"] });
      toast.success("Recado marcado como lido.");
    },
    onError: (erro) =>
      toast.error(mensagemErro(erro, "Erro ao marcar como lido")),
  });

  const alternar = (id: string) =>
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id],
    );

  const alternarEdit = (id: string) =>
    setEditSelecionados((atual) =>
      atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id],
    );

  const todosMarcados =
    alcancaveis.length > 0 && selecionados.length === alcancaveis.length;

  const abrirEdicao = (recado: WhatsappRecado) => {
    setRecadoParaEditar(recado);
    setEditTexto(recado.texto);
    setEditEnviarPlataforma(recado.enviarPlataforma ?? true);
    setEditEnviarWhatsapp(recado.enviarWhatsapp ?? true);
    setEditAgendarPara(
      recado.enviarEm
        ? new Date(recado.enviarEm).toISOString().slice(0, 16)
        : "",
    );
    setEditSelecionados(recado.destinatarios.map((d) => d.nome)); // Note: edit form uses vendor selection
  };

  if (carregandoPessoas) {
    return (
      <p className="text-sm text-muted-foreground">Carregando a equipe...</p>
    );
  }

  return (
    <div data-tour="rotina" className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Central de Recados da Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Envie comunicados internos para a equipe via Plataforma (sino/mural)
          e/ou WhatsApp institucional.
        </p>
      </div>

      <Tabs defaultValue="recebidos" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="recebidos" className="gap-2">
            <Inbox className="size-4" />
            Recebidos por mim
            {naoLidosCount > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0.2 text-xs">
                {naoLidosCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="escrever" className="gap-2">
            <SendHorizontal className="size-4" />
            Novo Recado
          </TabsTrigger>
          <TabsTrigger value="enviados" className="gap-2">
            <Clock className="size-4" />
            Meus Recados (Enviados)
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: RECADOS RECEBIDOS */}
        <TabsContent value="recebidos" className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Inbox className="size-4 text-primary" />
                Recados Recebidos
                {naoLidosCount > 0 && (
                  <Badge variant="secondary">{naoLidosCount} novo(s)</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              {(!recadosRecebidos || recadosRecebidos.length === 0) && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Você não possui recados recebidos até o momento.
                </p>
              )}
              {recadosRecebidos?.map((r) => {
                const foiLido = Boolean(r.lidoEm);
                return (
                  <div key={r.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {r.criadoPorNome}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {formatarDataHora(r.criadoEm)}
                        </span>
                        {foiLido ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Lido em {formatarDataHora(r.lidoEm!)}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Novo
                          </Badge>
                        )}
                      </div>

                      {!foiLido && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={marcarLido.isPending}
                          onClick={() => marcarLido.mutate(r.recadoId)}
                        >
                          <Check className="size-3.5" />
                          Marcar como lido
                        </Button>
                      )}
                    </div>

                    <p className="text-sm bg-muted/30 rounded-md p-3 border whitespace-pre-wrap">
                      {r.texto}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        Canal:
                        {r.enviarPlataforma && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            <Bell className="size-3 mr-1" /> Plataforma
                          </Badge>
                        )}
                        {r.enviarWhatsapp && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            <MessageSquare className="size-3 mr-1" /> WhatsApp
                          </Badge>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: ESCREVER NOVO RECADO */}
        <TabsContent value="escrever" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-tour="recados-equipe">
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

                <div className="max-h-80 space-y-1 overflow-y-auto border rounded-md p-2">
                  {alcancaveis.map((p) => (
                    <label
                      key={p.vendedorId}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
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

                {semTelefone.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" />
                      Sem telefone no cadastro (receberão apenas via Plataforma):
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
                <CardTitle data-tour="recados-mensagem">O recado</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                <Field>
                  <FieldLabel htmlFor="texto">Mensagem</FieldLabel>
                  <Textarea
                    id="texto"
                    rows={5}
                    maxLength={LIMITE_TEXTO}
                    placeholder="Amanhã a reunião começa às 8h, na sala principal."
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <FieldDescription>
                    Assinado automaticamente com seu nome.{" "}
                    {LIMITE_TEXTO - texto.length} caracteres restantes.
                  </FieldDescription>
                </Field>

                <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                  <FieldLabel className="text-xs font-semibold">Canais de envio</FieldLabel>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={enviarPlataforma}
                        onCheckedChange={(val) => setEnviarPlataforma(Boolean(val))}
                      />
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <Bell className="size-3.5 text-primary" />
                        Plataforma (Sino / Mural)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={enviarWhatsapp}
                        onCheckedChange={(val) => setEnviarWhatsapp(Boolean(val))}
                      />
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <MessageSquare className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        WhatsApp da Empresa
                      </span>
                    </label>
                  </div>
                </div>

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
                    Em branco, sai agora. Agendado, você poderá editar ou cancelar até o horário.
                  </FieldDescription>
                </Field>

                <Button
                  className="w-full"
                  disabled={
                    enviar.isPending ||
                    selecionados.length === 0 ||
                    texto.trim().length < 3 ||
                    (!enviarPlataforma && !enviarWhatsapp)
                  }
                  onClick={() => enviar.mutate()}
                >
                  <Send className="size-4" />
                  {enviar.isPending
                    ? "Enviando..."
                    : agendarPara
                      ? `Agendar para ${selecionados.length} pessoa(s)`
                      : `Enviar agora para ${selecionados.length} pessoa(s)`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA 3: MEUS RECADOS (ENVIADOS) */}
        <TabsContent value="enviados" className="space-y-4">
          {recadosEnviados && recadosEnviados.length > 0 ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle data-tour="recados-historico">
                  Histórico de Recados Enviados
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y pt-0">
                {recadosEnviados.map((r) => (
                  <div key={r.id} className="space-y-2 py-4">
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
                          ? `agendado para ${formatarDataHora(r.enviarEm)}`
                          : r.status}
                      </Badge>

                      <span className="text-xs text-muted-foreground">
                        Criado em {formatarDataHora(r.criadoEm)} · {r.enviados}{" "}
                        enviado(s)
                        {r.falhas > 0 && ` · ${r.falhas} falha(s)`}
                      </span>

                      <div className="flex items-center gap-1.5 ml-auto">
                        {r.status === "pendente" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => abrirEdicao(r)}
                            >
                              <Pencil className="size-3.5" />
                              Editar
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                              onClick={() => cancelar.mutate(r.id)}
                            >
                              <Trash2 className="size-3.5" />
                              Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-sm bg-muted/20 p-2.5 rounded border whitespace-pre-wrap">
                      {r.texto}
                    </p>

                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Destinatários e confirmações de leitura:
                      </p>
                      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                        {r.destinatarios.map((d) => (
                          <div
                            key={d.nome}
                            className="flex flex-col text-xs border rounded p-1.5 bg-background"
                          >
                            <span className="font-medium">{d.nome}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              <span>
                                WhatsApp:{" "}
                                <span
                                  className={
                                    d.status === "enviada"
                                      ? "text-emerald-600 font-medium"
                                      : d.status === "erro"
                                        ? "text-destructive font-medium"
                                        : ""
                                  }
                                >
                                  {d.status}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 text-[11px]">
                              {d.lidoEm ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCheck className="size-3.5" />
                                  Lido em {formatarDataHora(d.lidoEm)}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="size-3" />
                                  Pendente de leitura
                                </span>
                              )}
                            </div>
                            {d.erro && (
                              <p className="text-[10px] text-destructive mt-0.5">
                                {d.erro}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhum recado enviado recentemente.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* MODAL DE EDIÇÃO DE RECADO AGENDADO */}
      <Dialog
        open={Boolean(recadoParaEditar)}
        onOpenChange={(open) => {
          if (!open) setRecadoParaEditar(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Recado Agendado</DialogTitle>
            <DialogDescription>
              Altere a mensagem, horário de envio ou canais antes do despacho.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel htmlFor="edit-texto">Mensagem</FieldLabel>
              <Textarea
                id="edit-texto"
                rows={4}
                maxLength={LIMITE_TEXTO}
                value={editTexto}
                onChange={(e) => setEditTexto(e.target.value)}
              />
            </Field>

            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <FieldLabel className="text-xs font-semibold">Canais de envio</FieldLabel>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={editEnviarPlataforma}
                    onCheckedChange={(val) => setEditEnviarPlataforma(Boolean(val))}
                  />
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <Bell className="size-3.5 text-primary" />
                    Plataforma
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={editEnviarWhatsapp}
                    onCheckedChange={(val) => setEditEnviarWhatsapp(Boolean(val))}
                  />
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <MessageSquare className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    WhatsApp
                  </span>
                </label>
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-agendar">Data e Hora de Envio</FieldLabel>
              <Input
                id="edit-agendar"
                type="datetime-local"
                value={editAgendarPara}
                onChange={(e) => setEditAgendarPara(e.target.value)}
              />
              <FieldDescription>
                Se limpar a data, o recado será despachado imediatamente.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecadoParaEditar(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={editar.isPending || editTexto.trim().length < 3}
              onClick={() => editar.mutate()}
            >
              {editar.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
