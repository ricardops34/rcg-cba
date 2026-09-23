"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Clock, Key, History, Activity, AlertTriangle, Lock } from "lucide-react";
import type { EmpresaSuporteAcesso, EmpresaSuporteLog } from "@plataforma/contracts";

export default function SuporteAcessoPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [duracaoHoras, setDuracaoHoras] = useState<number>(4);
  const [motivo, setMotivo] = useState("");

  const { data: ativo, isLoading: loadingAtivo } = useQuery({
    queryKey: ["suporte-acesso-ativo"],
    queryFn: () => apiFetch<EmpresaSuporteAcesso | null>("/suporte-acesso/ativo"),
    refetchInterval: 30000,
  });

  const { data: historico, isLoading: loadingHistorico } = useQuery({
    queryKey: ["suporte-acesso-historico"],
    queryFn: () => apiFetch<EmpresaSuporteAcesso[]>("/suporte-acesso/historico"),
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ["suporte-acesso-logs"],
    queryFn: () => apiFetch<EmpresaSuporteLog[]>("/suporte-acesso/logs"),
  });

  const concederMutation = useMutation({
    mutationFn: async () => {
      if (!motivo.trim()) throw new Error("Informe o motivo ou número do chamado de suporte");
      return apiFetch<EmpresaSuporteAcesso>("/suporte-acesso/conceder", {
        method: "POST",
        body: JSON.stringify({ duracaoHoras, motivo }),
      });
    },
    onSuccess: () => {
      toast.success("Acesso de suporte liberado com sucesso!");
      setModalOpen(false);
      setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["suporte-acesso-ativo"] });
      queryClient.invalidateQueries({ queryKey: ["suporte-acesso-historico"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao conceder acesso de suporte");
    },
  });

  const revogarMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<EmpresaSuporteAcesso>(`/suporte-acesso/revogar/${id}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast.success("Acesso de suporte revogado imediatamente.");
      queryClient.invalidateQueries({ queryKey: ["suporte-acesso-ativo"] });
      queryClient.invalidateQueries({ queryKey: ["suporte-acesso-historico"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao revogar acesso de suporte");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">Liberação & Auditoria de Suporte</h1>
        <p className="text-sm text-muted-foreground">
          Controle o acesso temporário da equipe da Plataforma ao seu ambiente e monitore o log auditado de todas as ações executadas.
        </p>
      </div>

      {/* Card de Status do Acesso Ativo */}
      <Card className={ativo ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20" : "border-border"}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {ativo ? (
                <>
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Acesso de Suporte Ativo</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <span>Acesso da Plataforma Bloqueado</span>
                </>
              )}
            </CardTitle>
            <CardDescription>
              {ativo
                ? "A equipe da plataforma pode visualizar e auxiliar no seu ambiente até a expiração."
                : "Por padrão, administradores e analistas da plataforma NÃO possuem acesso aos dados da sua empresa."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {ativo ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => revogarMutation.mutate(ativo.id)}
                disabled={revogarMutation.isPending}
              >
                Revogar Acesso Agora
              </Button>
            ) : (
              <Button onClick={() => setModalOpen(true)} className="gap-2">
                <Key className="w-4 h-4" />
                Liberar Acesso de Suporte
              </Button>
            )}
          </div>
        </CardHeader>
        {ativo && (
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-background/80 p-4 rounded-lg border">
              <div>
                <span className="text-muted-foreground block text-xs">Válido até</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-4 h-4" />
                  {new Date(ativo.validoAte).toLocaleString("pt-BR")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Liberado por</span>
                <span className="font-medium text-foreground block mt-0.5">
                  {ativo.concedidoPor?.nome} ({ativo.concedidoPor?.email})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Motivo / Observação</span>
                <span className="font-medium text-foreground block mt-0.5 truncate">{ativo.motivo}</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabela de Histórico e Auditoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Concessões Anteriores */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico de Concessões
            </CardTitle>
            <CardDescription>Registro de todas as vezes que o acesso foi liberado.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistorico ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando histórico...</div>
            ) : !historico || historico.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma liberação registrada até o momento.</div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {historico.map((item) => {
                  const expirado = new Date(item.validoAte) < new Date();
                  const revogado = !!item.revogadoEm;
                  const emVigor = !expirado && !revogado;

                  return (
                    <div key={item.id} className="p-3 border rounded-lg text-sm space-y-2 bg-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {emVigor && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">Ativo</Badge>}
                          {revogado && <Badge variant="destructive">Revogado</Badge>}
                          {expirado && !revogado && <Badge variant="secondary">Expirado</Badge>}
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        {emVigor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 text-xs"
                            onClick={() => revogarMutation.mutate(item.id)}
                          >
                            Revogar
                          </Button>
                        )}
                      </div>
                      <p className="font-medium text-foreground text-xs leading-relaxed">{item.motivo}</p>
                      <div className="text-[11px] text-muted-foreground flex justify-between pt-1 border-t">
                        <span>Por: {item.concedidoPor?.nome}</span>
                        <span>Válido até: {new Date(item.validoAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit Log de Ações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Log Auditado de Operações de Suporte
            </CardTitle>
            <CardDescription>Ações realizadas pelos técnicos da plataforma enquanto acessavam seu ambiente.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLogs ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando logs de auditoria...</div>
            ) : !logs || logs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum evento gravado. Nenhuma ação de suporte foi realizada recentemente.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 border rounded-lg text-xs space-y-1 bg-muted/30">
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {log.metodoHttp}
                        </Badge>
                        <span className="font-semibold text-foreground truncate max-w-[220px]" title={log.rota}>
                          {log.rota}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <span>Técnico: {log.usuarioPlataforma?.nome ?? log.usuarioPlataformaId}</span>
                      <span>IP: {log.ip || "N/A"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Conceder Acesso */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Liberar Acesso de Suporte Temporário
            </DialogTitle>
            <DialogDescription>
              Esta ação permite que a equipe técnica da plataforma acesse temporariamente seu ambiente de trabalho para auxiliar no suporte.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Duração da Liberação</Label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 4, 8, 24, 48].map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={duracaoHoras === h ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setDuracaoHoras(h)}
                  >
                    {h}h
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo / Chamado de Suporte *</Label>
              <Textarea
                id="motivo"
                placeholder="Ex.: Chamado #4092 - Dúvida no cálculo de impostos do orçamento"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                Todas as operações realizadas pela plataforma serão registradas em log auditado e você poderá revogar este acesso a qualquer momento.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => concederMutation.mutate()}
              disabled={concederMutation.isPending || !motivo.trim()}
              className="gap-2"
            >
              Conceder Acesso por {duracaoHoras}h
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
