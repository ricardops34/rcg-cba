"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Pencil, Trash2 } from "lucide-react";
import type { ProdutoFicha } from "@plataforma/contracts";
import { ApiError, apiFetch, assetUrl } from "@/lib/api-client";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/**
 * Fichas técnicas do produto.
 *
 * Cada ficha tem **duas caras**, e as duas aparecem aqui: o PDF do fabricante,
 * que o vendedor baixa e manda ao cliente, e o Markdown que o assistente
 * extraiu dele, que é o texto que a IA lê ao falar do produto.
 *
 * O Markdown é editável de propósito. É esta tela que mantém "a IA nunca passa
 * preço" verificável: se a ficha do fabricante trouxer tabela de preço, ela
 * está aqui para ser retirada — em vez de entrar no contexto do modelo sem
 * ninguém saber.
 *
 * Quem anexa é o assistente (Administração > assistente, com o PDF anexado à
 * mensagem). Não há botão de upload aqui porque o Markdown não sairia de lugar
 * nenhum: quem lê o PDF é o modelo.
 */

const tamanhoBr = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ProdutoFichasCard({
  produtoId,
  permitirEdicao = false,
}: {
  produtoId: string;
  permitirEdicao?: boolean;
}) {
  const queryClient = useQueryClient();
  const [emEdicao, setEmEdicao] = useState<ProdutoFicha | null>(null);
  const [titulo, setTitulo] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [visivelAgente, setVisivelAgente] = useState(true);
  const [aExcluir, setAExcluir] = useState<ProdutoFicha | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const { data: fichas = [], isLoading } = useQuery({
    queryKey: ["produtos", produtoId, "fichas"],
    queryFn: () => apiFetch<ProdutoFicha[]>(`/produtos/${produtoId}/fichas`),
  });

  const invalidar = () =>
    void queryClient.invalidateQueries({
      queryKey: ["produtos", produtoId, "fichas"],
    });

  const abrirEdicao = (f: ProdutoFicha) => {
    setEmEdicao(f);
    setTitulo(f.titulo);
    setMarkdown(f.markdown);
    setVisivelAgente(f.visivelAgente);
  };

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch(`/produtos/${produtoId}/fichas/${emEdicao?.id}`, {
        method: "PATCH",
        body: { titulo, markdown, visivelAgente },
      }),
    onSuccess: () => {
      toast.success("Ficha atualizada");
      setEmEdicao(null);
      invalidar();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar"),
  });

  const excluir = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/produtos/${produtoId}/fichas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Ficha excluída");
      setAExcluir(null);
      invalidar();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível excluir",
      ),
  });

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  // Sem ficha nenhuma o card não tem o que dizer: quem anexa é o assistente.
  if (fichas.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium">Fichas técnicas</p>

        {fichas.map((ficha) => (
          <div key={ficha.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{ficha.titulo}</span>
              <span className="text-xs text-muted-foreground">
                {ficha.arquivoNome} · {tamanhoBr(ficha.tamanho)}
              </span>
              {!ficha.visivelAgente && (
                <Badge variant="secondary">Oculta para a IA</Badge>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" asChild title="Baixar o PDF">
                  <a
                    href={assetUrl(ficha.url) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="size-4" />
                  </a>
                </Button>
                {permitirEdicao && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Editar o texto que a IA lê"
                      onClick={() => abrirEdicao(ficha)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAExcluir(ficha)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() =>
                setAberta((a) => (a === ficha.id ? null : ficha.id))
              }
            >
              {aberta === ficha.id
                ? "Ocultar o texto"
                : "Ver o texto que a IA lê"}
            </Button>

            {aberta === ficha.id && (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {ficha.markdown}
              </pre>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog
        open={!!emEdicao}
        onOpenChange={(aberto) => !aberto && setEmEdicao(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar a ficha</DialogTitle>
            <DialogDescription>
              Este texto é o que a IA lê ao falar do produto. Retire daqui o que
              não deve chegar a quem pergunta — tabela de preço do fabricante,
              por exemplo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="ficha-titulo">Título</FieldLabel>
              <Input
                id="ficha-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="ficha-markdown">Texto (Markdown)</FieldLabel>
              <Textarea
                id="ficha-markdown"
                rows={18}
                className="font-mono text-xs"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={visivelAgente}
                onCheckedChange={(v) => setVisivelAgente(!!v)}
              />
              A IA pode usar esta ficha ao falar do produto
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmEdicao(null)}>
              Cancelar
            </Button>
            <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
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
            <DialogTitle>Excluir {aExcluir?.titulo}?</DialogTitle>
            <DialogDescription>
              O PDF sai do disco junto e a IA deixa de ter este texto. Para só
              tirar do alcance da IA, edite a ficha e desmarque a opção.
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
    </Card>
  );
}
