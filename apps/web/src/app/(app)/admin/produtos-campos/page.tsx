"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ProdutoCampo,
  ProdutoCampoTipo,
} from "@plataforma/contracts";
import { PRODUTO_CAMPO_TIPO_LABEL } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
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

/**
 * Campos do Produto: o que a empresa quer guardar além do que vem do ERP.
 *
 * Vizinha de "Campos do Cliente" e com o mesmo espírito, mas não a mesma
 * coisa: lá se escolhe quais campos já existentes podem ser editados; aqui se
 * **cria** o campo, porque cada empresa guarda dados diferentes do produto —
 * diluição num químico, aplicação numa autopeça, tensão num elétrico.
 *
 * Preencher o valor é na tela do produto, com `produtos.editar`. Aqui só se
 * decide o que existe.
 */

const SEM_GRUPO = "Sem grupo";

/** Vira `peso-bruto` a partir de "Peso bruto" — só uma sugestão inicial. */
function sugerirChave(nome: string) {
  return nome
    .normalize("NFD")
    // A classe abaixo é a faixa dos acentos combinantes (U+0300 a U+036F),
    // que o NFD acabou de separar da letra.
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
    // O formulário do produto lê a mesma definição.
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
      toast.success(r.id ? "Campo alterado" : "Campo criado");
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

  // Agrupado como aparece no produto: é assim que se percebe que um campo foi
  // parar no grupo errado.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campos do Produto
          </h1>
          <p className="text-sm text-muted-foreground">
            Dados que só a sua empresa guarda — dimensões, diluição, validade,
            aplicação. Aparecem no cadastro de cada produto.
          </p>
        </div>
        {podeCadastrar && (
          <Button onClick={() => setRascunho({ ...VAZIO })}>
            <Plus className="size-4" />
            Novo campo
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : campos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum campo complementar ainda. O cadastro de produto mostra apenas
            o que vem do ERP.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(([grupo, doGrupo]) => (
            <Card key={grupo}>
              <CardContent className="space-y-1 p-4">
                <p className="pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {grupo}
                </p>
                {doGrupo.map((campo) => (
                  <div
                    key={campo.id}
                    className="flex flex-wrap items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <span className="w-8 text-xs text-muted-foreground">
                      {campo.ordem}
                    </span>
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-medium">
                        {campo.nome}
                        {campo.unidade && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({campo.unidade})
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {campo.chave}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {PRODUTO_CAMPO_TIPO_LABEL[campo.tipo]}
                    </Badge>
                    {campo.obrigatorio && (
                      <Badge variant="secondary">Obrigatório</Badge>
                    )}
                    {!campo.visivelAgente && (
                      <Badge variant="secondary">Oculto para a IA</Badge>
                    )}
                    {!campo.ativo && <Badge variant="destructive">Inativo</Badge>}
                    <div className="ml-auto flex gap-1">
                      {podeEditar && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRascunho(paraRascunho(campo))}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {podeExcluir && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAExcluir(campo)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!rascunho}
        onOpenChange={(aberto) => !aberto && setRascunho(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Alterar campo" : "Novo campo"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "A chave não muda: é por ela que a IA e as integrações referenciam o campo."
                : "O nome é o que aparece na tela; a chave é o identificador estável."}
            </DialogDescription>
          </DialogHeader>

          {rascunho && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-nome">Nome</FieldLabel>
                  <Input
                    id="campo-nome"
                    value={rascunho.nome}
                    placeholder="Peso bruto"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r
                          ? {
                              ...r,
                              nome: e.target.value,
                              // Só sugere enquanto o campo é novo e ninguém
                              // digitou a chave à mão.
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
                  <FieldLabel htmlFor="campo-chave">Chave</FieldLabel>
                  <Input
                    id="campo-chave"
                    value={rascunho.chave}
                    disabled={editando}
                    placeholder="peso-bruto"
                    className="font-mono"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, chave: e.target.value } : r,
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <FieldLabel>Tipo</FieldLabel>
                  <Select
                    value={rascunho.tipo}
                    onValueChange={(v) =>
                      setRascunho((r) =>
                        r ? { ...r, tipo: v as ProdutoCampoTipo } : r,
                      )
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
                  <FieldLabel htmlFor="campo-unidade">Unidade</FieldLabel>
                  <Input
                    id="campo-unidade"
                    value={rascunho.unidade}
                    placeholder="kg"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, unidade: e.target.value } : r,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-ordem">Ordem</FieldLabel>
                  <Input
                    id="campo-ordem"
                    inputMode="numeric"
                    value={rascunho.ordem}
                    onChange={(e) =>
                      setRascunho((r) =>
                        r
                          ? { ...r, ordem: e.target.value.replace(/\D/g, "") }
                          : r,
                      )
                    }
                  />
                </div>
              </div>

              {rascunho.tipo === "lista" && (
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-opcoes">
                    Opções — uma por linha
                  </FieldLabel>
                  <Textarea
                    id="campo-opcoes"
                    rows={4}
                    value={rascunho.opcoes}
                    placeholder={"Concentrado\nPronto para uso"}
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, opcoes: e.target.value } : r,
                      )
                    }
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-grupo">Grupo</FieldLabel>
                  <Input
                    id="campo-grupo"
                    value={rascunho.grupo}
                    placeholder="Dimensões"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, grupo: e.target.value } : r,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="campo-ajuda">Ajuda</FieldLabel>
                  <Input
                    id="campo-ajuda"
                    value={rascunho.ajuda}
                    placeholder="Proporção recomendada, ex. 1:100"
                    onChange={(e) =>
                      setRascunho((r) =>
                        r ? { ...r, ajuda: e.target.value } : r,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={rascunho.obrigatorio}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, obrigatorio: !!v } : r))
                    }
                  />
                  Obrigatório ao preencher o produto
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={rascunho.visivelAgente}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, visivelAgente: !!v } : r))
                    }
                  />
                  A IA pode citar este campo ao falar do produto
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={rascunho.ativo}
                    onCheckedChange={(v) =>
                      setRascunho((r) => (r ? { ...r, ativo: !!v } : r))
                    }
                  />
                  Ativo (aparece no cadastro de produto)
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                salvar.isPending || !rascunho?.nome.trim() || !rascunho?.chave.trim()
              }
              onClick={() => rascunho && salvar.mutate(rascunho)}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!aExcluir}
        onOpenChange={(aberto) => !aberto && setAExcluir(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {aExcluir?.nome}?</DialogTitle>
            <DialogDescription>
              O campo some do cadastro de produto. O que os produtos já têm
              preenchido continua gravado — se quiser só tirar da tela por um
              tempo, desative em vez de excluir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAExcluir(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={excluir.isPending}
              onClick={() => aExcluir && excluir.mutate(aExcluir.id)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
