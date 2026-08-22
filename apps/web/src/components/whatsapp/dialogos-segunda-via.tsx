"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { NotaSaida, TituloReceber } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Escolha do documento a mandar pela conversa — boleto e DANFE
 * (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * O critério dos dois é o mesmo: a lista vem do backend com a elegibilidade
 * já resolvida (`temBoleto` / `temXml`), e o item que não pode ser enviado
 * aparece **desabilitado com o motivo**, nunca escondido. O vendedor está com
 * o cliente esperando do outro lado — ele precisa saber o que responder, não
 * procurar um botão que sumiu.
 */

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

/** Item selecionável da lista, com o motivo quando indisponível. */
function Opcao({
  selecionada,
  disponivel,
  onClick,
  titulo,
  valor,
  motivo,
}: {
  selecionada: boolean;
  disponivel: boolean;
  onClick: () => void;
  titulo: string;
  valor: string;
  motivo: string;
}) {
  return (
    <button
      type="button"
      disabled={!disponivel}
      onClick={onClick}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
        !disponivel
          ? "cursor-not-allowed opacity-60"
          : selecionada
            ? "border-primary bg-primary/5"
            : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{titulo}</span>
        <span className="shrink-0 tabular-nums">{valor}</span>
      </div>
      {!disponivel && (
        <div className="text-xs text-muted-foreground">{motivo}</div>
      )}
    </button>
  );
}

/**
 * Boleto: um título por vez.
 *
 * Diferente de "enviar títulos em aberto", que manda a lista em texto — são
 * duas perguntas diferentes do cliente ("o que eu devo?" × "me manda o
 * boleto").
 */
export function BoletoDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");

  const titulosQuery = useQuery({
    queryKey: ["whatsapp-titulos", conversaId],
    queryFn: () =>
      apiFetch<{ data: TituloReceber[] }>(
        `/whatsapp/conversas/${conversaId}/acoes/titulos`,
      ),
    enabled: aberto,
  });
  const titulos = titulosQuery.data?.data ?? [];

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/acoes/boleto`, {
        method: "POST",
        body: {
          tituloReceberId: escolhido,
          legenda: legenda.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Boleto enviado para o cliente");
      setEscolhido(null);
      setLegenda("");
      onOpenChange(false);
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
      // O envio entra no histórico de atendimento do cliente como atividade.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao enviar o boleto",
      ),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar 2ª via de boleto</DialogTitle>
          <DialogDescription>
            O PDF vai como anexo e a linha digitável na legenda. Título vencido
            sai com o valor atualizado (multa e juros); passados 30 dias do
            vencimento a emissão não é mais permitida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {titulosQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando títulos…</p>
          ) : titulos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este cliente não tem títulos em aberto.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {titulos.map((t) => (
                <Opcao
                  key={t.id}
                  selecionada={escolhido === t.id}
                  disponivel={t.temBoleto}
                  onClick={() => setEscolhido(t.id)}
                  titulo={`${t.numero}${t.parcela ? `/${t.parcela}` : ""} — venc. ${dataBr(t.vencimento)}`}
                  valor={moeda(t.saldo)}
                  motivo="Sem 2ª via: título sem registro bancário no ERP, ou vencido há mais de 30 dias."
                />
              ))}
            </div>
          )}

          <Textarea
            placeholder="Mensagem que acompanha o boleto (em branco: vai o valor e a linha digitável)"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            onClick={() => enviar.mutate()}
            disabled={!escolhido || enviar.isPending}
          >
            {enviar.isPending ? "Enviando…" : "Enviar boleto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DANFE: renderizado na hora, a partir do XML autorizado da nota.
 *
 * O XML pode ir junto, numa segunda mensagem — é o que o contador do cliente
 * costuma pedir, e são dois arquivos distintos para quem recebe.
 */
export function DanfeDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [incluirXml, setIncluirXml] = useState(false);
  const [legenda, setLegenda] = useState("");

  const notasQuery = useQuery({
    queryKey: ["whatsapp-notas", conversaId],
    queryFn: () =>
      apiFetch<{ data: NotaSaida[] }>(
        `/whatsapp/conversas/${conversaId}/acoes/notas`,
      ),
    enabled: aberto,
  });
  const notas = notasQuery.data?.data ?? [];

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch<{ xmlEnviado: boolean; motivoXml: string | null }>(
        `/whatsapp/conversas/${conversaId}/acoes/danfe`,
        {
          method: "POST",
          body: {
            notaSaidaId: escolhida,
            incluirXml,
            legenda: legenda.trim() || undefined,
          },
        },
      ),
    onSuccess: (resultado) => {
      // O DANFE pode ter ido e o XML não — o backend não desfaz o envio que
      // deu certo, então a mensagem precisa dizer o que faltou.
      if (incluirXml && !resultado.xmlEnviado) {
        toast.warning(
          `DANFE enviado, mas o XML não foi: ${resultado.motivoXml ?? "falha no envio"}`,
        );
      } else {
        toast.success("Nota enviada para o cliente");
      }
      setEscolhida(null);
      setIncluirXml(false);
      setLegenda("");
      onOpenChange(false);
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
      // O envio entra no histórico de atendimento do cliente como atividade.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao enviar a nota",
      ),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar 2ª via do DANFE</DialogTitle>
          <DialogDescription>
            O DANFE é gerado agora, a partir do XML autorizado da nota. Nota
            cancelada é enviada com o carimbo de cancelamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {notasQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando notas…</p>
          ) : notas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este cliente não tem notas fiscais.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {notas.map((n) => (
                <Opcao
                  key={n.id}
                  selecionada={escolhida === n.id}
                  disponivel={n.temXml}
                  onClick={() => setEscolhida(n.id)}
                  titulo={`NF ${n.numero}${n.serie ? `/${n.serie}` : ""} — ${dataBr(n.dtEmissao)}`}
                  valor={moeda(n.vlrBruto)}
                  motivo="Sem 2ª via: o XML desta nota ainda não foi enviado pelo ERP."
                />
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={incluirXml}
              onCheckedChange={(v) => setIncluirXml(v === true)}
            />
            Enviar também o arquivo XML
          </label>

          <Textarea
            placeholder="Mensagem que acompanha o arquivo (opcional)"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            onClick={() => enviar.mutate()}
            disabled={!escolhida || enviar.isPending}
          >
            {enviar.isPending ? "Enviando…" : "Enviar nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
