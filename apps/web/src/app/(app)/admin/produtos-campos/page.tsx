"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Package,
  Layers,
  Bot,
  CheckCircle2,
  Tag,
  HelpCircle,
  Folder,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ProdutoCampo,
  ProdutoCampoTipo,
} from "@plataforma/contracts";
import { PRODUTO_CAMPO_TIPO_LABEL } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const SEM_GRUPO = "Gerais / Sem grupo";

/** Vira `peso-bruto` a partir de "Peso bruto" — só uma sugestão inicial. */
function sugerirChave(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface Rascunho {
  id?: string;
  chave: string;
  nome: string;
  tipo: ProdutoCampoTipo;
  unidade: string;
  opcoes: string;
  grupo: string;
  ajuda: string;
  ordem: string;
  obrigatorio: boolean;
  visivelAgente: boolean;
  ativo: boolean;
}

const VAZIO: Rascunho = {
  chave: "",
  nome: "",
  tipo: "texto",
  unidade: "",
  opcoes: "",
  grupo: "",
  ajuda: "",
  ordem: "0",
  obrigatorio: false,
  visivelAgente: true,
  ativo: true,
};

function paraRascunho(campo: ProdutoCampo): Rascunho {
  return {
    id: campo.id,
    chave: campo.chave,
    nome: campo.nome,
    tipo: campo.tipo,
    unidade: campo.unidade ?? "",
    opcoes: campo.opcoes.join("\n"),
    grupo: campo.grupo ?? "",
    ajuda: campo.ajuda ?? "",
    ordem: String(campo.ordem),
    obrigatorio: campo.obrigatorio,
    visivelAgente: campo.visivelAgente,
    ativo: campo.ativo,
  };
}

export default function ProdutosCamposPage() {
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aExcluir, setAExcluir] = useState<ProdutoCampo | null>(null);

  const podeCadastrar = useAuthStore((s) =>
    s.hasPermission("produtos-campos", "cadastrar"),
  );
  const podeEditar = useAuthStore((s) =>
    s.hasPermission("produtos-campos", "editar"),
  );
  const podeExcluir = useAuthStore((s) =>
    s.hasPermission("produtos-campos", "excluir"),
  );

  const { data: campos = [], isLoading } = useQuery({
    queryKey: ["produtos-campos"],
    queryFn: () => apiFetch<ProdutoCampo[]>("/produtos-campos"),
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["produtos-campos"] });
    void queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const salvar = useMutation({
    mutationFn: (r: Rascunho) => {
      const corpo = {
        nome: r.nome.trim(),
        tipo: r.tipo,
        unidade: r.unidade.trim() || null,
        opcoes:
          r.tipo === "lista"
            ? r.opcoes
                .split("\n")
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
        grupo: r.grupo.trim() || null,
        ajuda: r.ajuda.trim() || null,
        ordem: Number(r.ordem) || 0,
        obrigatorio: r.obrigatorio,
        visivelAgente: r.visivelAgente,
        ativo: r.ativo,
      };
      return r.id
        ? apiFetch(`/produtos-campos/${r.id}`, { method: "PATCH", body: corpo })
        : apiFetch("/produtos-campos", {
            method: "POST",
            body: { ...corpo, chave: r.chave.trim() },
          });
    },
    onSuccess: (_, r) => {
      toast.success(r.id ? "Campo alterado com sucesso" : "Campo criado com sucesso");
      setRascunho(null);
      invalidar();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível salvar o campo",
      ),
  });

  const excluir = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/produtos-campos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Campo excluído");
      setAExcluir(null);
      invalidar();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível excluir o campo",
      ),
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, ProdutoCampo[]>();
    for (const c of campos) {
      const chave = c.grupo?.trim() || SEM_GRUPO;
      mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b),
    );
  }, [campos]);

  const editando = !!rascunho?.id;
  const totalCampos = campos.length;
  const totalAtivos = campos.filter((c) => c.ativo).length;
  const totalVisiveisAgente = campos.filter((c) => c.visivelAgente).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Campos do Produto
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os atributos e especificações técnicas complementares cadastrados nos produtos da empresa.
          </p>
        </div>
        {podeCadastrar && (
          <Button onClick={() => setRascunho({ ...VAZIO })} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo campo
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Campos
              </p>
              <p className="text-2xl font-bold mt-1">{totalCampos}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Campos Ativos
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAtivos}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  {grupos.length} grupo(s)
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Visíveis para IA
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {totalVisiveisAgente}
                </p>
                <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs">
                  Agente AI
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-400">
              <Bot className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : campos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Nenhum campo personalizado</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Nenhum campo complementar cadastrado. Adicione atributos como especificações técnicas, dimensões e diluição.
            </p>
            {podeCadastrar && (
              <Button onClick={() => setRascunho({ ...VAZIO })} className="mt-4" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Criar primeiro campo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map(([grupo, doGrupo]) => (
            <Card key={grupo} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{grupo}</CardTitle>
                      <CardDescription className="text-xs">
                        {doGrupo.length} {doGrupo.length === 1 ? "campo cadastrado" : "campos cadastrados"}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {doGrupo.map((campo) => (
                  <div
                    key={campo.id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="h-4 w-4 mt-1 text-muted-foreground/50 shrink-0" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {campo.nome}
                          </span>
                          {campo.unidade && (
                            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                              {campo.unidade}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs font-mono">
                            {campo.chave}
                          </Badge>
                        </div>
                        {campo.ajuda && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <HelpCircle className="h-3 w-3 inline" />
                            {campo.ajuda}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 pl-7 sm:pl-0">
                      <Badge variant="secondary" className="text-xs">
                        {PRODUTO_CAMPO_TIPO_LABEL[campo.tipo]}
                      </Badge>

                      {campo.obrigatorio && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                          Obrigatório
                        </Badge>
                      )}

                      {campo.visivelAgente ? (
                        <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs">
                          <Bot className="h-3 w-3 mr-1 inline" /> Visível IA
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          Oculto IA
                        </Badge>
                      )}

                      {!campo.ativo ? (
                        <Badge variant="destructive" className="text-xs">
                          Inativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 text-xs">
                          Ativo
                        </Badge>
                      )}

                      <div className="flex items-center gap-1 ml-auto">
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setRascunho(paraRascunho(campo))}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {podeExcluir && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setAExcluir(campo)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Criar / Editar Campo */}
      <Dialog open={!!rascunho} onOpenChange={(aberto) => !aberto && setRascunho(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              {editando ? "Alterar Campo do Produto" : "Novo Campo do Produto"}
            </DialogTitle>
            <DialogDescription>
              {editando
                ? "A chave identificadora é imutável para garantir integridade com a IA e ERPs."
                : "Defina o nome de exibição e a chave única de identificação do atributo."}
            </DialogDescription>
          </DialogHeader>

          {rascunho && (
            <FieldGroup className="space-y-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-nome">Nome de exibição</FieldLabel>
                  <Input
                    id="campo-nome"
                    value={rascunho.nome}
                    placeholder="Ex: Peso Bruto"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r
                          ? {
                              ...r,
                              nome: e.target.value,
                              chave:
                                !r.id && sugerirChave(r.nome) === r.chave
                                  ? sugerirChave(e.target.value)
                                  : r.chave,
                            }
                          : r,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-chave">Chave identificadora</FieldLabel>
                  <Input
                    id="campo-chave"
                    value={rascunho.chave}
                    disabled={editando}
                    placeholder="peso-bruto"
                    className="font-mono text-xs"
                    onChange={(e) =>
                      setRascunho((r) => (r ? { ...r, chave: e.target.value } : r))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <FieldLabel>Tipo de Dado</FieldLabel>
                  <Select
                    value={rascunho.tipo}
                    onValueChange={(v) =>
                      setRascunho((r) => (r ? { ...r, tipo: v as ProdutoCampoTipo } : r))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(PRODUTO_CAMPO_TIPO_LABEL) as ProdutoCampoTipo[]
                      ).map((t) => (
                        <SelectItem key={t} value={t}>
                          {PRODUTO_CAMPO_TIPO_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-unidade">Unidade (Opcional)</FieldLabel>
                  <Input
                    id="campo-unidade"
                    value={rascunho.unidade}
                    placeholder="kg, mm, L"
                    onChange={(e) =>
                      setRascunho((r) => (r ? { ...r, unidade: e.target.value } : r))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-ordem">Ordem de Exibição</FieldLabel>
                  <Input
                    id="campo-ordem"
                    inputMode="numeric"
                    value={rascunho.ordem}
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, ordem: e.target.value.replace(/\D/g, "") } : r
                      )
                    }
                  />
                </div>
              </div>

              {rascunho.tipo === "lista" && (
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-opcoes">
                    Opções da Lista (uma por linha)
                  </FieldLabel>
                  <Textarea
                    id="campo-opcoes"
                    rows={4}
                    value={rascunho.opcoes}
                    placeholder={"Concentrado\nPronto para uso"}
                    onChange={(e) =>
                      setRascunho((r) => (r ? { ...r, opcoes: e.target.value } : r))
                    }
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-grupo">Grupo / Categoria</FieldLabel>
                  <Input
                    id="campo-grupo"
                    value={rascunho.grupo}
                    placeholder="Ex: Dimensões"
                    onChange={(e) =>
                      setRascunho((r) => (r ? { ...r, grupo: e.target.value } : r))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-ajuda">Texto de Ajuda</FieldLabel>
                  <Input
                    id="campo-ajuda"
                    value={rascunho.ajuda}
                    placeholder="Orientação de preenchimento"
                    onChange={(e) =>
                      setRascunho((r) => (r ? { ...r, ajuda: e.target.value } : r))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={rascunho.obrigatorio}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, obrigatorio: !!v } : r))
                    }
                  />
                  Preenchimento obrigatório no cadastro do produto
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={rascunho.visivelAgente}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, visivelAgente: !!v } : r))
                    }
                  />
                  Disponível para leitura e recomendação pelo Agente de IA
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={rascunho.ativo}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, ativo: !!v } : r))
                    }
                  />
                  Ativo (exibido nas telas de cadastro de produto)
                </label>
              </div>
            </FieldGroup>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button
              disabled={salvar.isPending || !rascunho?.nome.trim() || !rascunho?.chave.trim()}
              onClick={() => rascunho && salvar.mutate(rascunho)}
            >
              {salvar.isPending ? "Salvando..." : "Salvar Campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão */}
      <Dialog open={!!aExcluir} onOpenChange={(aberto) => !aberto && setAExcluir(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir campo &quot;{aExcluir?.nome}&quot;?</DialogTitle>
            <DialogDescription>
              Esta ação remove o campo do formulário de produto. Os dados gravados em produtos existentes não serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAExcluir(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={excluir.isPending}
              onClick={() => aExcluir && excluir.mutate(aExcluir.id)}
            >
              {excluir.isPending ? "Excluindo..." : "Excluir Definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

