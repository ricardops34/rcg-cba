"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { toast } from "sonner";
import { ImageIcon, Star, Trash2, Upload } from "lucide-react";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Galeria editável compartilhada pelo Cadastro e pelo detalhe Comercial.
 * A API devolve o produto completo após cada operação, permitindo atualizar
 * o mesmo cache usado pelas duas telas sem uma nova requisição.
 */
export function ProdutoFotosCard({
  produto,
  permitirEdicao = false,
}: {
  produto: Produto;
  permitirEdicao?: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const atualizarCache = (atualizado: Produto) => {
    queryClient.setQueryData(["produtos", produto.id], atualizado);
    void queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const enviarFoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!arquivos.length) return;

    setEnviando(true);
    try {
      let atualizado = produto;
      for (const arquivo of arquivos) {
        atualizado = await apiUpload<Produto>(
          `/produtos/${produto.id}/foto`,
          arquivo,
        );
      }
      atualizarCache(atualizado);
      toast.success(
        arquivos.length === 1
          ? "Foto adicionada"
          : `${arquivos.length} fotos adicionadas`,
      );
    } catch (erro) {
      toast.error(
        erro instanceof ApiError ? erro.message : "Erro ao enviar foto",
      );
    } finally {
      setEnviando(false);
    }
  };

  const definirPrincipal = async (fotoId: string) => {
    try {
      atualizarCache(
        await apiFetch<Produto>(
          `/produtos/${produto.id}/fotos/${fotoId}/principal`,
          { method: "PATCH" },
        ),
      );
      toast.success("Foto principal atualizada");
    } catch (erro) {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : "Erro ao definir foto principal",
      );
    }
  };

  const removerFoto = async (fotoId: string) => {
    if (!confirm("Excluir esta foto do produto?")) return;
    try {
      atualizarCache(
        await apiFetch<Produto>(
          `/produtos/${produto.id}/fotos/${fotoId}`,
          { method: "DELETE" },
        ),
      );
      toast.success("Foto removida");
    } catch (erro) {
      toast.error(
        erro instanceof ApiError ? erro.message : "Erro ao remover foto",
      );
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Fotos do produto</p>
            <p className="text-xs text-muted-foreground">
              A foto principal pode aparecer no orçamento conforme o parâmetro da empresa.
              PNG ou JPEG, até 5 MB cada.
            </p>
          </div>
          {permitirEdicao ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={enviarFoto}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviando}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-4" />
                {enviando ? "Enviando..." : "Adicionar fotos"}
              </Button>
            </>
          ) : null}
        </div>

        {produto.fotos.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {produto.fotos.map((foto) => (
              <div
                key={foto.id}
                className="relative overflow-hidden rounded-lg border bg-muted/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(foto.url) ?? ""}
                  alt={produto.descricao}
                  className="aspect-square w-full object-contain"
                />
                {foto.principal ? (
                  <Badge className="absolute left-2 top-2">
                    <Star className="size-3 fill-current" /> Principal
                  </Badge>
                ) : null}
                {permitirEdicao ? (
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    {!foto.principal ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        title="Definir como principal"
                        onClick={() => definirPrincipal(foto.id)}
                      >
                        <Star className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="destructive"
                      title="Excluir foto"
                      onClick={() => removerFoto(foto.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed bg-muted/20">
            <ImageIcon className="size-8 text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
