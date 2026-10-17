"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  ROTEIRO_MAX_DIAS,
  ROTEIRO_MOTIVO_ROTULO,
  type RoteiroGravar,
  type RoteiroParametros,
  type RoteiroPrevia,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** AAAA-MM-DD do dia local (o que o campo de data entrega e a API espera). */
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const maisDias = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
/** `datetime-local` na hora local, a partir de um instante ISO. */
const paraInputLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${diaLocal(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface Parametros {
  dataInicio: string;
  dataFim: string;
  intervaloMin: number;
  usarSemCompra: boolean;
  semCompraDias: number;
  tituloVencido: boolean;
  naoCompraramNoMes: boolean;
  mesmoPeriodoMesPassado: boolean;
  horaInicio: string;
  horaFim: string;
  textoNota: string;
}

const padrao = (): Parametros => ({
  dataInicio: diaLocal(new Date()),
  dataFim: diaLocal(maisDias(new Date(), 4)),
  intervaloMin: 30,
  usarSemCompra: true,
  semCompraDias: 30,
  tituloVencido: true,
  naoCompraramNoMes: false,
  mesmoPeriodoMesPassado: false,
  horaInicio: "08:00",
  horaFim: "18:00",
  textoNota: "",
});

/**
 * Gera o roteiro semanal de atendimentos por WhatsApp, em dois passos:
 * **parâmetros** → **prévia** (revisável) → gravar. Nada é enviado ao cliente
 * agora: o vendedor confirma o dia antes de o sistema abrir as conversas.
 */
export function RoteiroGerarDialog({
  aberto,
  onOpenChange,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [p, setP] = useState<Parametros>(padrao);
  const [prévia, setPrévia] = useState<RoteiroPrevia | null>(null);
  // Por cliente: entra no roteiro? e em que horário (editável).
  const [escolhas, setEscolhas] = useState<Record<string, { incluir: boolean; quando: string }>>({});

  const dias =
    (Date.parse(`${p.dataFim}T00:00:00Z`) - Date.parse(`${p.dataInicio}T00:00:00Z`)) / 86_400_000;
  const algumCriterio =
    p.usarSemCompra || p.tituloVencido || p.naoCompraramNoMes || p.mesmoPeriodoMesPassado;
  const periodoOk = !!p.dataInicio && !!p.dataFim && dias >= 0 && dias < ROTEIRO_MAX_DIAS;
  const podeGerar = periodoOk && algumCriterio && p.intervaloMin >= 5 && p.textoNota.trim().length >= 3;

  const parametros = (): RoteiroParametros => ({
    dataInicio: p.dataInicio,
    dataFim: p.dataFim,
    intervaloMin: p.intervaloMin,
    criterios: {
      semCompraDias: p.usarSemCompra ? p.semCompraDias : null,
      tituloVencido: p.tituloVencido,
      naoCompraramNoMes: p.naoCompraramNoMes,
      mesmoPeriodoMesPassado: p.mesmoPeriodoMesPassado,
    },
    horaInicio: p.horaInicio,
    horaFim: p.horaFim,
  });

  const gerarPrevia = useMutation({
    mutationFn: () =>
      apiFetch<RoteiroPrevia>("/whatsapp/roteiros/previa", { method: "POST", body: parametros() }),
    onSuccess: (r) => {
      setPrévia(r);
      setEscolhas(
        Object.fromEntries(
          r.itens.map((i) => [i.clienteId, { incluir: true, quando: paraInputLocal(i.quando) }]),
        ),
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível montar a prévia"),
  });

  const gravar = useMutation({
    mutationFn: () => {
      const itens = (prévia?.itens ?? [])
        .filter((i) => escolhas[i.clienteId]?.incluir)
        .map((i) => ({
          clienteId: i.clienteId,
          quando: new Date(escolhas[i.clienteId].quando).toISOString(),
          motivos: i.motivos,
          detalhe: i.detalhe,
        }));
      const corpo = { parametros: parametros(), textoNota: p.textoNota.trim(), itens };
      return apiFetch<{ quantidade: number }>("/whatsapp/roteiros", {
        method: "POST",
        body: corpo as unknown as RoteiroGravar,
      });
    },
    onSuccess: (r) => {
      toast.success(
        `${r.quantidade} ${r.quantidade === 1 ? "atendimento gravado" : "atendimentos gravados"} na sua agenda. Confirme o dia antes de começar.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["roteiro-itens"] });
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      fechar(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível gravar o roteiro"),
  });

  const fechar = (v: boolean) => {
    if (!v) {
      setPrévia(null);
      setEscolhas({});
    }
    onOpenChange(v);
  };

  const escolhidos = Object.values(escolhas).filter((e) => e.incluir).length;
  const mudar = <K extends keyof Parametros>(k: K, v: Parametros[K]) => {
    setP((atual) => ({ ...atual, [k]: v }));
    // Mexeu nos parâmetros: a prévia anterior não vale mais.
    setPrévia(null);
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5" />
            Gerar roteiro de atendimentos
          </DialogTitle>
          <DialogDescription>
            O sistema escolhe clientes da sua carteira e os distribui nos seus horários livres. Nada é
            enviado agora: antes de começar, você confirma o dia.
          </DialogDescription>
        </DialogHeader>

        {!prévia ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">De</span>
                <Input type="date" value={p.dataInicio} onChange={(e) => mudar("dataInicio", e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Até (no máximo {ROTEIRO_MAX_DIAS} dias)</span>
                <Input type="date" value={p.dataFim} min={p.dataInicio} onChange={(e) => mudar("dataFim", e.target.value)} />
              </label>
            </div>
            {!periodoOk && p.dataInicio && p.dataFim ? (
              <p className="text-xs text-destructive">
                O período precisa ter de 1 a {ROTEIRO_MAX_DIAS} dias, com a data final depois da inicial.
              </p>
            ) : null}

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Intervalo entre uma conversa e a próxima (minutos)</span>
              <Input
                type="number"
                min={5}
                max={240}
                className="w-32"
                value={p.intervaloMin}
                onChange={(e) => mudar("intervaloMin", Number(e.target.value))}
              />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Quais clientes entram</legend>
              <label className="flex flex-wrap items-center gap-2">
                <Checkbox checked={p.usarSemCompra} onCheckedChange={(v) => mudar("usarSemCompra", v === true)} />
                Não compram há
                <Input
                  type="number"
                  min={1}
                  max={720}
                  className="h-8 w-20"
                  disabled={!p.usarSemCompra}
                  value={p.semCompraDias}
                  onChange={(e) => mudar("semCompraDias", Number(e.target.value))}
                />
                dias
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={p.tituloVencido} onCheckedChange={(v) => mudar("tituloVencido", v === true)} />
                Com título vencido
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={p.naoCompraramNoMes} onCheckedChange={(v) => mudar("naoCompraramNoMes", v === true)} />
                Compraram no mês passado e ainda não neste mês
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={p.mesmoPeriodoMesPassado}
                  onCheckedChange={(v) => mudar("mesmoPeriodoMesPassado", v === true)}
                />
                Compraram no mesmo período do mês passado
              </label>
              {!algumCriterio ? <p className="text-xs text-destructive">Escolha ao menos um critério.</p> : null}
            </fieldset>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">
                Nota que fica em cada conversa iniciada (visível a você, ao supervisor e ao gerente; não vai ao cliente)
              </span>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Ex.: Reativação — clientes com título vencido ou sem compra há 30 dias."
                value={p.textoNota}
                onChange={(e) => setP((a) => ({ ...a, textoNota: e.target.value }))}
              />
            </label>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Horário do dia (usado só se você não tem horário de trabalho cadastrado)
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <Input type="time" className="w-28" value={p.horaInicio} onChange={(e) => mudar("horaInicio", e.target.value)} />
                até
                <Input type="time" className="w-28" value={p.horaFim} onChange={(e) => mudar("horaFim", e.target.value)} />
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {prévia.resumo.candidatos} clientes nos critérios · {prévia.resumo.horariosLivres} horários livres ·
              horário de trabalho {prévia.resumo.expediente === "cadastro" ? "do seu cadastro" : "informado por você"}.
              Revise: tire quem não quer e ajuste os horários.
            </p>

            {prévia.itens.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                Nenhum atendimento coube. Aumente o período, o intervalo menor ou mude os critérios.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {prévia.itens.map((i) => {
                  const e = escolhas[i.clienteId];
                  return (
                    <li key={i.clienteId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={!!e?.incluir}
                        onCheckedChange={(v) =>
                          setEscolhas((a) => ({ ...a, [i.clienteId]: { ...a[i.clienteId], incluir: v === true } }))
                        }
                        aria-label={`Incluir ${i.clienteNome}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{i.clienteNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.motivos.map((m) => ROTEIRO_MOTIVO_ROTULO[m]).join(" · ")}
                          {i.detalhe ? ` — ${i.detalhe}` : ""}
                          {i.origem === "cadastro" ? " · conversa será criada pelo telefone do cadastro" : ""}
                        </p>
                      </div>
                      <Input
                        type="datetime-local"
                        className="h-8 w-52"
                        disabled={!e?.incluir}
                        value={e?.quando ?? ""}
                        onChange={(ev) =>
                          setEscolhas((a) => ({ ...a, [i.clienteId]: { ...a[i.clienteId], quando: ev.target.value } }))
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            {prévia.semHorario.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium">Sem horário livre ({prévia.semHorario.length}):</p>
                <p className="text-muted-foreground">
                  {prévia.semHorario.map((c) => c.clienteNome).join(", ")}. Aumente o período para incluí-los.
                </p>
              </div>
            ) : null}
            {prévia.semWhatsapp.length > 0 ? (
              <div className="rounded-lg border p-3 text-xs">
                <p className="font-medium">Não dá para iniciar conversa ({prévia.semWhatsapp.length}):</p>
                <p className="text-muted-foreground">
                  {prévia.semWhatsapp.map((c) => c.clienteNome).join(", ")} — sem conversa, vínculo nem telefone
                  no cadastro.
                </p>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {prévia ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPrévia(null)}>
                Voltar
              </Button>
              <Button
                type="button"
                disabled={escolhidos === 0 || gravar.isPending}
                onClick={() => gravar.mutate()}
              >
                {gravar.isPending ? "Gravando…" : `Gravar ${escolhidos} ${escolhidos === 1 ? "atendimento" : "atendimentos"}`}
              </Button>
            </>
          ) : (
            <Button type="button" disabled={!podeGerar || gerarPrevia.isPending} onClick={() => gerarPrevia.mutate()}>
              {gerarPrevia.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Montando…
                </>
              ) : (
                "Montar prévia"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
