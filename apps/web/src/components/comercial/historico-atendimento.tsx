"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareText } from "lucide-react";
import { SMS_MENSAGEM_MAX, type Atividade } from "@plataforma/contracts";
import { useEnvioPorSms, useSmsDisponivel } from "@/components/comercial/segunda-via";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { TIPO_COR, TIPO_LABEL } from "@/components/crud/atividade-tipo";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Quantas atividades a aba mostra; o resto fica em CRM › Atividades. */
const LIMITE = 100;

const dataHora = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/**
 * Aba "Histórico de atendimento" da Posição do Cliente (pedido do usuário,
 * 01/10/2026): tudo o que foi feito pelo cliente — visitas, ligações,
 * propostas, 2ª via e cobrança enviadas por WhatsApp ou e-mail — mais recente
 * primeiro.
 *
 * É a mesma consulta de CRM › Atividades filtrada pelo cliente: o histórico
 * mora num lugar só (ver `registrar-atividade-documento.ts`), e a carteira de
 * quem consulta vale aqui como lá.
 */
/**
 * SMS livre ao cliente, para o celular do cadastro (a API não aceita outro).
 * O nome da empresa vai na frente; acima de 160 caracteres vira dois SMS.
 */
function EnviarSmsCliente({ clienteId }: { clienteId: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const { enviar, enviando } = useEnvioPorSms();

  const confirmar = async () => {
    const ok = await enviar(`/sms/cliente/${clienteId}`, { mensagem: texto.trim() }, null);
    if (ok) {
      setAberto(false);
      setTexto("");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto(true)}>
        <MessageSquareText className="size-4" />
        Enviar SMS
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar SMS ao cliente</DialogTitle>
            <DialogDescription>
              Vai para o celular do cadastro do cliente, com o nome da empresa na frente. A
              resposta dele aparece neste histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={texto}
            maxLength={SMS_MENSAGEM_MAX}
            rows={4}
            placeholder="Ex.: Ola! Seu pedido saiu para entrega hoje."
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {texto.length}/{SMS_MENSAGEM_MAX} caracteres
            {texto.length > 140 ? " · acima de ~140 (com o nome da empresa) vira dois SMS" : ""}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!texto.trim() || enviando} onClick={() => void confirmar()}>
              {enviando && <Loader2 className="size-4 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HistoricoAtendimento({ clienteId }: { clienteId: string }) {
  const smsLivre = useSmsDisponivel()?.mensagemLivre ?? false;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["atividades", "cliente", clienteId, "historico"],
    queryFn: () =>
      apiFetch<{ data: Atividade[]; total: number }>("/atividades", {
        query: {
          clienteId,
          page: 1,
          pageSize: LIMITE,
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      }),
  });

  const atividades = data?.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3">
        {smsLivre && (
          <div className="flex justify-end">
            <EnviarSmsCliente clienteId={clienteId} />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : atividades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum atendimento registrado para este cliente.
          </p>
        ) : (
          <>
            <ol className="max-h-[520px] space-y-0 overflow-y-auto rounded-lg border">
              {atividades.map((a) => {
                const quando = a.concluida
                  ? a.dataConclusao ?? a.createdAt
                  : a.dataVencimento ?? a.createdAt;
                return (
                  <li
                    key={a.id}
                    className="flex gap-3 border-t px-3 py-2.5 first:border-t-0"
                  >
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${TIPO_COR[a.tipo]}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Link
                          href={`/crm/atividades/${a.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.titulo}
                        </Link>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {dataHora(quando)}
                        </span>
                      </div>
                      {a.descricao && (
                        <p className="text-xs break-words text-muted-foreground">{a.descricao}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {TIPO_LABEL[a.tipo]}
                        {" · "}
                        {a.concluida ? "Concluída" : "Pendente"}
                        {" · "}
                        {a.vendedor.nomeReduzido || a.vendedor.nome}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {(data?.total ?? 0) > atividades.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando os {atividades.length} mais recentes de {data?.total}. O histórico
                completo está em{" "}
                <Link href="/crm/atividades" className="underline">
                  CRM › Atividades
                </Link>
                .
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
