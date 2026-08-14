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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

/** O "de → para" de uma solicitação, que é o que a decisão precisa mostrar. */
function DiffCampos({ alteracoes }: { alteracoes: ClienteAlteracao["alteracoes"] }) {
  const entradas = Object.entries(alteracoes ?? {});
  if (entradas.length === 0) {
    return <span className="text-sm text-muted-foreground">Sem diferenças</span>;
  }
  return (
    <div className="space-y-1">
      {entradas.map(([campo, { de, para }]) => (
        <div key={campo} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-40 font-medium">
            {CAMPO_CLIENTE_LABEL[campo] ?? campo}
          </span>
          <span className="text-muted-foreground line-through">
            {valorLegivel(de)}
          </span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
          <span className="font-medium">{valorLegivel(para)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Fila de aprovação do cadastro de cliente.
 *
 * Desde a governança do cadastro, nenhuma origem — tela, consulta de CNPJ,
 * integração do ERP ou agente — altera cliente direto: tudo para aqui, e o
 * cadastro só muda quando alguém com `clientes.aprovar` libera.
 */
export default function ClientesAlteracoesPage() {
  const queryClient = useQueryClient();
  const podeAprovar = useAuthStore((s) => s.hasPermission("clientes", "aprovar"));

  const [status, setStatus] = useState<StatusAlteracaoCliente>("pendente");
  const [busca, setBusca] = useState("");
  const [recusando, setRecusando] = useState<ClienteAlteracao | null>(null);
  const [motivo, setMotivo] = useState("");

  const chave = ["clientes-alteracoes", status, busca];
  const { data, isLoading } = useQuery({
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
    mutationFn: (id: string) =>
      apiFetch(`/clientes-alteracoes/${id}/aprovar`, { method: "POST" }),
    onSuccess: () => {
      invalidar();
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusAlteracaoCliente)}>
            <TabsList>
              <TabsTrigger value="pendente">Pendentes</TabsTrigger>
              <TabsTrigger value="aprovada">Aprovadas</TabsTrigger>
              <TabsTrigger value="rejeitada">Recusadas</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            className="w-full sm:w-72"
            placeholder="Buscar pela razão social..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {status === "pendente"
              ? "Nenhuma alteração aguardando aprovação."
              : "Nada aqui."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {linhas.map((linha) => (
            <Card key={linha.id}>
              <CardContent className="space-y-3 pt-6">
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
                </div>

                <DiffCampos alteracoes={linha.alteracoes} />

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

                {linha.status === "pendente" && podeAprovar && (
                  <div className="flex justify-end gap-2">
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
                      onClick={() => aprovar.mutate(linha.id)}
                      disabled={aprovar.isPending}
                    >
                      <Check className="size-4" />
                      Aprovar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
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
    </div>
  );
}
