"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CAMPO_CLIENTE_LABEL,
  ORIGEM_ALTERACAO_CLIENTE_LABEL,
  STATUS_ALTERACAO_CLIENTE_LABEL,
  type ClienteAlteracao,
  type StatusAlteracaoCliente,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CrudHeader } from "@/components/crud/crud-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Check, X } from "lucide-react";

interface Pagina<T> {
  data: T[];
  total: number;
}

const dataHora = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

/** Valor cru do diff em texto legível — o JSON traz null, boolean e número. */
function valorLegivel(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function StatusBadge({ status }: { status: StatusAlteracaoCliente }) {
  const classe =
    status === "pendente"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : status === "aprovada"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs ${classe}`}>
      {STATUS_ALTERACAO_CLIENTE_LABEL[status]}
    </span>
  );
}

/**
 * O "de → para" de uma solicitação, que é o que a decisão precisa mostrar.
 *
 * Com `marcados`, cada campo vira uma escolha: a Receita costuma trazer o
 * endereço certo junto de um nome fantasia velho, e antes o jeito de aceitar
 * metade era recusar tudo e reeditar à mão. O que ficar desmarcado vai para o
 * histórico do cliente como reprovado — não some.
 */
function DiffCampos({
  alteracoes,
  marcados,
  onAlternar,
}: {
  alteracoes: ClienteAlteracao["alteracoes"];
  marcados?: string[];
  onAlternar?: (campo: string) => void;
}) {
  const entradas = Object.entries(alteracoes ?? {});
  if (entradas.length === 0) {
    return <span className="text-sm text-muted-foreground">Sem diferenças</span>;
  }
  const selecionavel = !!marcados && !!onAlternar;
  return (
    <div className="space-y-1">
      {entradas.map(([campo, { de, para }]) => {
        const linha = (
          <>
            <span className="min-w-40 font-medium">
              {CAMPO_CLIENTE_LABEL[campo] ?? campo}
            </span>
            <span className="text-muted-foreground line-through">
              {valorLegivel(de)}
            </span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
            <span className="font-medium">{valorLegivel(para)}</span>
          </>
        );
        if (!selecionavel) {
          return (
            <div key={campo} className="flex flex-wrap items-center gap-2 text-sm">
              {linha}
            </div>
          );
        }
        return (
          <label
            key={campo}
            className="flex cursor-pointer flex-wrap items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50"
          >
            <Checkbox
              checked={marcados.includes(campo)}
              onCheckedChange={() => onAlternar(campo)}
            />
            {linha}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Fila de aprovação do cadastro de cliente.
 *
 * Desde a governança do cadastro, nenhuma origem — tela, consulta de CNPJ,
 * integração do ERP ou agente — muda valor do cliente direto: tudo para aqui, e
 * o cadastro só muda quando alguém com `clientes.aprovar` libera. A exceção,
 * desde 07/10/2026, é a consulta à Receita preenchendo direto o campo vazio.
 */
export default function ClientesAlteracoesPage() {
  const queryClient = useQueryClient();
  const podeAprovar = useAuthStore((s) => s.hasPermission("clientes", "aprovar"));

  const [status, setStatus] = useState<StatusAlteracaoCliente>("pendente");
  const [busca, setBusca] = useState("");
  const [recusando, setRecusando] = useState<ClienteAlteracao | null>(null);
  const [motivo, setMotivo] = useState("");
  // Campos marcados por solicitação. Sem entrada = tudo marcado, que é o caso
  // comum: quem abre a fila costuma aprovar a solicitação inteira.
  const [selecao, setSelecao] = useState<Record<string, string[]>>({});
  // Aprovar/recusar todas as pendentes da página, de uma vez.
  const [lote, setLote] = useState<"aprovar" | "recusar" | null>(null);
  const [processandoLote, setProcessandoLote] = useState(false);

  const camposDe = (linha: ClienteAlteracao) =>
    Object.keys(linha.alteracoes ?? {});
  const marcadosDe = (linha: ClienteAlteracao) =>
    selecao[linha.id] ?? camposDe(linha);
  const alternarCampo = (linha: ClienteAlteracao, campo: string) =>
    setSelecao((s) => {
      const atual = s[linha.id] ?? camposDe(linha);
      return {
        ...s,
        [linha.id]: atual.includes(campo)
          ? atual.filter((c) => c !== campo)
          : [...atual, campo],
      };
    });

  const chave = ["clientes-alteracoes", status, busca];
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: chave,
    queryFn: () =>
      apiFetch<Pagina<ClienteAlteracao>>("/clientes-alteracoes", {
        query: { status, search: busca || undefined, pageSize: 50 },
      }),
  });
  const linhas = data?.data ?? [];

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["clientes-alteracoes"] });
    // O cadastro em si muda ao aprovar — a listagem de clientes precisa saber.
    void queryClient.invalidateQueries({ queryKey: ["clientes"] });
  };

  const aprovar = useMutation({
    mutationFn: ({ id, campos }: { id: string; campos: string[] }) =>
      apiFetch(`/clientes-alteracoes/${id}/aprovar`, {
        method: "POST",
        body: { campos },
      }),
    onSuccess: (_, { id }) => {
      invalidar();
      setSelecao((s) => {
        const { [id]: _removida, ...resto } = s;
        return resto;
      });
      toast.success("Alteração aprovada e aplicada no cadastro");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao aprovar"),
  });

  const recusar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiFetch(`/clientes-alteracoes/${id}/recusar`, {
        method: "POST",
        body: { motivo },
      }),
    onSuccess: () => {
      invalidar();
      setRecusando(null);
      setMotivo("");
      toast.success("Alteração recusada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao recusar"),
  });

  const pendentes = linhas.filter((l) => l.status === "pendente");
  // Em cada uma vale o que está marcado nela; sem campo marcado fica de fora
  // da aprovação em lote (aprovar nada é recusar, e recusa pede motivo).
  const aprovaveis = pendentes.filter((l) => marcadosDe(l).length > 0);

  // Uma por vez, pelas mesmas rotas da linha: a API confere permissão e escopo
  // de cada uma, e a falha de uma não impede as outras.
  const executarLote = async () => {
    if (!lote) return;
    const alvo = lote === "aprovar" ? aprovaveis : pendentes;
    setProcessandoLote(true);
    let ok = 0;
    const falhas: string[] = [];
    for (const linha of alvo) {
      try {
        await apiFetch(`/clientes-alteracoes/${linha.id}/${lote}`, {
          method: "POST",
          body: lote === "aprovar" ? { campos: marcadosDe(linha) } : { motivo },
        });
        ok += 1;
      } catch (err) {
        falhas.push(
          `${linha.clienteRazaoSocial ?? "Cliente"}: ${err instanceof ApiError ? err.message : "erro"}`,
        );
      }
    }
    setProcessandoLote(false);
    setLote(null);
    setMotivo("");
    setSelecao({});
    invalidar();
    const verbo = lote === "aprovar" ? "aprovada(s)" : "recusada(s)";
    if (ok > 0) toast.success(`${ok} alteração(ões) ${verbo}`);
    if (falhas.length > 0) {
      toast.error(`${falhas.length} não foram processadas: ${falhas.slice(0, 3).join(" · ")}`);
    }
  };

  return (
    <div className="space-y-4">
      <CrudHeader
        search={busca}
        onSearchChange={setBusca}
        placeholder="Buscar pela razão social..."
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />
      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusAlteracaoCliente)}>
        <TabsList>
          <TabsTrigger value="pendente">Pendentes</TabsTrigger>
          <TabsTrigger value="aprovada">Aprovadas</TabsTrigger>
          <TabsTrigger value="rejeitada">Recusadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {status === "pendente" && podeAprovar && pendentes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground">
            {pendentes.length} alteração(ões) pendente(s) nesta página
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLote("recusar")}
            disabled={processandoLote}
          >
            <X className="size-4" />
            Recusar todas
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setLote("aprovar")}
            disabled={processandoLote || aprovaveis.length === 0}
          >
            <Check className="size-4" />
            Aprovar todas
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Não foi possível carregar as alterações."}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : linhas.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
            {status === "pendente"
              ? "Nenhuma alteração aguardando aprovação."
              : "Nada aqui."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Alterações</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.id}>
              <TableCell className="align-top whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {linha.clienteRazaoSocial ?? "Cliente"}
                  </span>
                  {linha.clienteCodigoErp && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {linha.clienteCodigoErp}
                    </span>
                  )}
                  <StatusBadge status={linha.status} />
                  <Badge variant="outline">
                    {ORIGEM_ALTERACAO_CLIENTE_LABEL[linha.origem]}
                  </Badge>
                  {/* Fila de envio ao Protheus: só o que foi aprovado vai, e
                      fica "aguardando" até o ERP confirmar que gravou na SA1. */}
                  {linha.envioErp && (
                    <Badge
                      variant="outline"
                      className={
                        linha.envioErp.situacao === "enviado"
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/40 text-amber-700 dark:text-amber-400"
                      }
                      title={
                        linha.envioErp.situacao === "enviado"
                          ? `Gravado no Protheus em ${dataHora(linha.envioErp.enviadoEm)}`
                          : "Na fila: o Protheus grava na SA1 no próximo ciclo do retorno"
                      }
                    >
                      {linha.envioErp.situacao === "enviado"
                        ? "Enviado ao ERP"
                        : "Aguardando envio ao ERP"}
                    </Badge>
                  )}
                </div>

              </TableCell>
              <TableCell className="min-w-80 align-top whitespace-normal">
                <DiffCampos
                  alteracoes={linha.alteracoes}
                  {...(linha.status === "pendente" && podeAprovar
                    ? {
                        marcados: marcadosDe(linha),
                        onAlternar: (campo: string) =>
                          alternarCampo(linha, campo),
                      }
                    : {})}
                />

              </TableCell>
              <TableCell className="min-w-48 space-y-2 align-top whitespace-normal">
                <p className="text-xs text-muted-foreground">
                  Solicitado por {linha.solicitadoPorNome ?? "—"} em{" "}
                  {dataHora(linha.solicitadoEm)}
                  {linha.analisadoEm && (
                    <>
                      {" "}
                      · Analisado por {linha.analisadoPorNome ?? "—"} em{" "}
                      {dataHora(linha.analisadoEm)}
                    </>
                  )}
                </p>
                {linha.motivoRecusa && (
                  <p className="text-xs text-destructive">
                    Motivo da recusa: {linha.motivoRecusa}
                  </p>
                )}

              </TableCell>
              <TableCell className="align-top whitespace-normal">
                {linha.status === "pendente" && podeAprovar && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {marcadosDe(linha).length < camposDe(linha).length && (
                      <span className="mr-auto text-xs text-muted-foreground">
                        {camposDe(linha).length - marcadosDe(linha).length} campo(s)
                        desmarcado(s) — vão para o histórico como reprovados.
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRecusando(linha)}
                    >
                      <X className="size-4" />
                      Recusar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        aprovar.mutate({
                          id: linha.id,
                          campos: marcadosDe(linha),
                        })
                      }
                      // Sem nada marcado não é aprovação: é recusa, e recusa
                      // exige motivo.
                      disabled={aprovar.isPending || marcadosDe(linha).length === 0}
                    >
                      <Check className="size-4" />
                      {marcadosDe(linha).length < camposDe(linha).length
                        ? `Aprovar ${marcadosDe(linha).length} campo(s)`
                        : "Aprovar"}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!recusando} onOpenChange={(open) => !open && setRecusando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar alteração</DialogTitle>
            <DialogDescription>
              O cadastro não será alterado. O motivo fica registrado para quem
              solicitou saber o que corrigir.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da recusa"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                recusando && recusar.mutate({ id: recusando.id, motivo })
              }
              disabled={motivo.trim().length < 3 || recusar.isPending}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!lote}
        onOpenChange={(open) => !open && !processandoLote && setLote(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lote === "aprovar"
                ? `Aprovar ${aprovaveis.length} alteração(ões)`
                : `Recusar ${pendentes.length} alteração(ões)`}
            </DialogTitle>
            <DialogDescription>
              {lote === "aprovar"
                ? "Cada cadastro recebe os campos que estão marcados na linha dele. Os desmarcados vão para o histórico como reprovados."
                : "Nenhum cadastro será alterado. O motivo fica registrado em todas, para quem solicitou saber o que corrigir."}
              {lote === "aprovar" && aprovaveis.length < pendentes.length && (
                <>
                  {" "}
                  {pendentes.length - aprovaveis.length} sem nenhum campo marcado
                  ficam de fora.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {lote === "recusar" && (
            <Textarea
              placeholder="Motivo da recusa"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLote(null)}
              disabled={processandoLote}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void executarLote()}
              disabled={
                processandoLote ||
                (lote === "recusar" && motivo.trim().length < 3)
              }
            >
              {processandoLote
                ? "Processando..."
                : lote === "aprovar"
                  ? "Aprovar todas"
                  : "Recusar todas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
