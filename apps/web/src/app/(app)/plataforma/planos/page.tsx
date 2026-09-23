"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Plano } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PlataformaGuard } from "../plataforma-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Plus, Pencil, Trash2, CheckCircle2, Shield } from "lucide-react";

type PlanoExt = Plano & {
  moduloIds?: string[];
  menuIds?: string[];
  rotinaIds?: string[];
  totalEmpresas?: number;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PlanosPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlano, setEditingPlano] = useState<PlanoExt | null>(null);

  const { data: planos, isLoading, refetch } = useQuery({
    queryKey: ["plataforma-planos"],
    queryFn: () => apiFetch<PlanoExt[]>("/plataforma/planos"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/plataforma/planos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Plano removido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["plataforma-planos"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao remover plano");
    },
  });

  const openNew = () => {
    setEditingPlano(null);
    setDialogOpen(true);
  };

  const openEdit = (p: PlanoExt) => {
    setEditingPlano(p);
    setDialogOpen(true);
  };

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="size-6 text-primary" /> Pacotes & Planos SaaS
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastre e gerencie os pacotes de funcionalidades e os valores de assinatura.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" /> Novo Pacote / Plano
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : !planos || planos.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Nenhum plano/pacote cadastrado.</p>
            <Button variant="outline" className="mt-4" onClick={openNew}>
              Cadastrar Primeiro Plano
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {planos.map((plano) => (
              <Card key={plano.id} className="relative flex flex-col justify-between overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plano.nome}</CardTitle>
                    <Badge variant={plano.ativo ? "default" : "secondary"}>
                      {plano.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {plano.descricao || `Código: ${plano.codigo}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-primary">
                      {moeda.format(plano.valorMensal)} <span className="text-xs font-normal text-muted-foreground">/mês</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Trimestral: {moeda.format(plano.valorTrimestral || 0)}</p>
                      <p>Semestral: {moeda.format(plano.valorSemestral || 0)}</p>
                      <p>Anual: {moeda.format(plano.valorAnual || 0)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>Usuários: {plano.limiteUsuarios ? `${plano.limiteUsuarios} máx.` : "Ilimitado"}</span>
                    <span>Assinantes: {plano.totalEmpresas || 0}</span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(plano)}>
                      <Pencil className="mr-1 size-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remover o plano ${plano.nome}?`)) {
                          deleteMutation.mutate(plano.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {dialogOpen && (
          <PlanoFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            plano={editingPlano}
            onSuccess={() => {
              setDialogOpen(false);
              refetch();
            }}
          />
        )}
      </div>
    </PlataformaGuard>
  );
}

function PlanoFormDialog({
  open,
  onOpenChange,
  plano,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plano: PlanoExt | null;
  onSuccess: () => void;
}) {
  const [nome, setNome] = useState(plano?.nome || "");
  const [codigo, setCodigo] = useState(plano?.codigo || "");
  const [descricao, setDescricao] = useState(plano?.descricao || "");
  const [valorMensal, setValorMensal] = useState(plano?.valorMensal?.toString() || "0");
  const [valorTrimestral, setValorTrimestral] = useState(plano?.valorTrimestral?.toString() || "0");
  const [valorSemestral, setValorSemestral] = useState(plano?.valorSemestral?.toString() || "0");
  const [valorAnual, setValorAnual] = useState(plano?.valorAnual?.toString() || "0");
  const [limiteUsuarios, setLimiteUsuarios] = useState(plano?.limiteUsuarios?.toString() || "");
  const [ativo, setAtivo] = useState(plano?.ativo ?? true);

  const [selectedModulos, setSelectedModulos] = useState<string[]>(plano?.moduloIds || []);
  const [selectedMenus, setSelectedMenus] = useState<string[]>(plano?.menuIds || []);
  const [selectedRotinas, setSelectedRotinas] = useState<string[]>(plano?.rotinaIds || []);

  const { data: arvore, isLoading: loadingArvore } = useQuery({
    queryKey: ["plataforma-arvore-recursos"],
    queryFn: () => apiFetch<any[]>("/estrutura/arvore"),
  });

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      plano
        ? apiFetch(`/plataforma/planos/${plano.id}`, { method: "PATCH", body: payload })
        : apiFetch("/plataforma/planos", { method: "POST", body: payload }),
    onSuccess: () => {
      toast.success(plano ? "Plano atualizado" : "Plano cadastrado");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar plano");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      nome,
      codigo,
      descricao,
      valorMensal: Number(valorMensal),
      valorTrimestral: Number(valorTrimestral),
      valorSemestral: Number(valorSemestral),
      valorAnual: Number(valorAnual),
      limiteUsuarios: limiteUsuarios ? Number(limiteUsuarios) : null,
      ativo,
      moduloIds: selectedModulos,
      menuIds: selectedMenus,
      rotinaIds: selectedRotinas,
    });
  };

  const toggleRotina = (rotinaId: string) => {
    setSelectedRotinas((prev) =>
      prev.includes(rotinaId) ? prev.filter((id) => id !== rotinaId) : [...prev, rotinaId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plano ? "Editar Pacote / Plano" : "Novo Pacote / Plano"}</DialogTitle>
          <DialogDescription>
            Configure as informações de preço e os recursos incluídos no pacote.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Nome do Pacote / Plano</FieldLabel>
              <Input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Profissional" />
            </Field>

            <Field>
              <FieldLabel>Código do Plano</FieldLabel>
              <Input
                required
                disabled={!!plano}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex: profissional"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Descrição</FieldLabel>
            <Textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o público-alvo ou diferenciais deste pacote..."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel>Mensal (R$)</FieldLabel>
              <Input type="number" step="any" value={valorMensal} onChange={(e) => setValorMensal(e.target.value)} />
            </Field>

            <Field>
              <FieldLabel>Trimestral (R$)</FieldLabel>
              <Input type="number" step="any" value={valorTrimestral} onChange={(e) => setValorTrimestral(e.target.value)} />
            </Field>

            <Field>
              <FieldLabel>Semestral (R$)</FieldLabel>
              <Input type="number" step="any" value={valorSemestral} onChange={(e) => setValorSemestral(e.target.value)} />
            </Field>

            <Field>
              <FieldLabel>Anual (R$)</FieldLabel>
              <Input type="number" step="any" value={valorAnual} onChange={(e) => setValorAnual(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Limite de Usuários (nulo = ilimitado)</FieldLabel>
              <Input
                type="number"
                value={limiteUsuarios}
                onChange={(e) => setLimiteUsuarios(e.target.value)}
                placeholder="Ilimitado"
              />
            </Field>

            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="plano-ativo" checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
              <label htmlFor="plano-ativo" className="text-sm font-medium cursor-pointer">
                Plano ativo para novas assinaturas
              </label>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="size-4 text-primary" /> Funcionalidades Incluídas no Pacote
            </h3>
            <p className="text-xs text-muted-foreground">
              Marque quais rotinas o plano oferece aos assinantes.
            </p>

            {loadingArvore ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                {arvore?.map((modulo: any) => (
                  <div key={modulo.id} className="space-y-2">
                    <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <span className="size-2 rounded-full bg-primary" /> {modulo.nome}
                    </div>
                    <div className="pl-4 space-y-2 border-l-2 border-primary/20">
                      {modulo.menus?.map((menu: any) => (
                        <div key={menu.id} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{menu.nome}</p>
                          <div className="flex flex-wrap gap-3 pl-2">
                            {menu.rotinas?.map((rotina: any) => {
                              const isChecked = selectedRotinas.includes(rotina.id);
                              return (
                                <label
                                  key={rotina.id}
                                  className="flex items-center gap-1.5 text-xs cursor-pointer bg-background border rounded px-2.5 py-1 hover:border-primary transition-colors"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={() => toggleRotina(rotina.id)}
                                  />
                                  <span>{rotina.nome}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : plano ? "Salvar Alterações" : "Criar Plano"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
