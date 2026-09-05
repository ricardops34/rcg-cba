"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type {
  Produto,
  ProdutoRelacaoTipo,
  ProdutoRelacionado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/**
 * Similares e aplicação — o que este produto tem a ver com os outros.
 *
 * São três listas, e não duas, porque a aplicação é **direcional**: no
 * equipamento em comodato aparece o que ele usa; no consumível, em que
 * equipamentos ele é usado. Similar é simétrico e tem uma lista só.
 *
 * A relação cadastrada do outro lado pode ser desfeita daqui: quem está vendo
 * "usado em" não deveria ter de ir até o outro produto para corrigir.
 */

/** As três seções da tela, na ordem em que aparecem. */
const SECOES: {
  tipo: ProdutoRelacaoTipo;
  origem: boolean | null;
  titulo: string;
  vazio: string;
}[] = [
  {
    tipo: "similar",
    // `null` = tanto faz de que lado foi cadastrado: similar é simétrico.
    origem: null,
    titulo: "Similares",
    vazio: "Nenhum similar cadastrado.",
  },
  {
    tipo: "aplicacao",
    origem: true,
    titulo: "Usa na aplicação",
    vazio: "Nenhum produto de aplicação cadastrado.",
  },
  {
    tipo: "aplicacao",
    origem: false,
    titulo: "Usado em",
    vazio: "",
  },
];

export function ProdutoRelacionadosCard({
  produtoId,
  permitirEdicao = false,
}: {
  produtoId: string;
  permitirEdicao?: boolean;
}) {
  const queryClient = useQueryClient();
  const [novoTipo, setNovoTipo] = useState<ProdutoRelacaoTipo | null>(null);
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [observacao, setObservacao] = useState("");

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["produtos", produtoId, "relacionados"],
    queryFn: () =>
      apiFetch<ProdutoRelacionado[]>(`/produtos/${produtoId}/relacionados`),
  });

  const invalidar = () =>
    void queryClient.invalidateQueries({
      queryKey: ["produtos", produtoId, "relacionados"],
    });

  const fecharDialogo = () => {
    setNovoTipo(null);
    setEscolhido(null);
    setObservacao("");
  };

  const criar = useMutation({
    mutationFn: () =>
      apiFetch(`/produtos/${produtoId}/relacionados`, {
        method: "POST",
        body: {
          relacionadoId: escolhido?.id,
          tipo: novoTipo,
          observacao: observacao.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Produto relacionado");
      fecharDialogo();
      invalidar();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível relacionar",
      ),
  });

  const remover = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/produtos/${produtoId}/relacionados/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("Relação desfeita");
      invalidar();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível desfazer",
      ),
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;

  // Sem relação nenhuma e sem poder criar, o card não tem o que dizer.
  if (linhas.length === 0 && !permitirEdicao) return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Produtos relacionados</p>
          {permitirEdicao && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNovoTipo("similar")}
              >
                <Plus className="size-4" />
                Similar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNovoTipo("aplicacao")}
              >
                <Plus className="size-4" />
                Aplicação
              </Button>
            </div>
          )}
        </div>

        {SECOES.map((secao) => {
          const daSecao = linhas.filter(
            (l) =>
              l.tipo === secao.tipo &&
              (secao.origem === null || l.origem === secao.origem),
          );
          // "Usado em" só existe quando há: é informação, não formulário.
          if (daSecao.length === 0 && !secao.vazio) return null;

          return (
            <div key={`${secao.tipo}-${String(secao.origem)}`} className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {secao.titulo}
              </p>
              {daSecao.length === 0 ? (
                <p className="text-sm text-muted-foreground">{secao.vazio}</p>
              ) : (
                <div className="space-y-1">
                  {daSecao.map((linha) => (
                    <div
                      key={linha.id}
                      className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {linha.codigoErp}
                      </span>
                      <span className="text-sm">{linha.descricao}</span>
                      {linha.unidade && (
                        <span className="text-xs text-muted-foreground">
                          {linha.unidade}
                        </span>
                      )}
                      {!linha.ativo && (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                      {linha.observacao && (
                        <span className="text-xs text-muted-foreground italic">
                          {linha.observacao}
                        </span>
                      )}
                      {permitirEdicao && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto"
                          disabled={remover.isPending}
                          onClick={() => remover.mutate(linha.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog
        open={!!novoTipo}
        onOpenChange={(aberto) => !aberto && fecharDialogo()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {novoTipo === "similar"
                ? "Relacionar um similar"
                : "Relacionar um produto de aplicação"}
            </DialogTitle>
            <DialogDescription>
              {novoTipo === "similar"
                ? "Vale nos dois sentidos: cadastrando aqui, o outro produto também passa a mostrar este como similar."
                : "Cadastre no equipamento os produtos que ele usa. Do lado do consumível, a relação aparece como “Usado em”."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Tipo</FieldLabel>
              <Select
                value={novoTipo ?? "similar"}
                onValueChange={(v) => setNovoTipo(v as ProdutoRelacaoTipo)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="similar">Similar (substitui)</SelectItem>
                  <SelectItem value="aplicacao">
                    Aplicação (este produto usa o outro)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <FieldLabel>Produto</FieldLabel>
              <ProdutoCombobox
                value={escolhido?.id ?? null}
                onChange={setEscolhido}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="relacao-observacao">Observação</FieldLabel>
              <Input
                id="relacao-observacao"
                value={observacao}
                placeholder="Dose de 20 ml por litro"
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharDialogo}>
              Cancelar
            </Button>
            <Button
              disabled={!escolhido || criar.isPending}
              onClick={() => criar.mutate()}
            >
              Relacionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
