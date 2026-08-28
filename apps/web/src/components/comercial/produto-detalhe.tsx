"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { toast } from "sonner";
import { ImageIcon, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { StatusDot } from "@/components/crud/status-dot";
import { regraDescontoLabel } from "@/lib/regra-desconto";

export type ProdutoDetalhe = Produto & {
  categoria?: {
    id: string;
    codigoErp: string | null;
    descricao: string;
  } | null;
  subCategoria?: {
    id: string;
    codigoErp: string | null;
    descricao: string;
  } | null;
  armazem?: { id: string; codigoErp: string | null; descricao: string } | null;
};

const moeda = (v: number | null | undefined) =>
  v != null
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

/** Corpo do detalhe de um produto — usado tanto na página cheia quanto na cortina. */
export function ProdutoDetalheContent({
  produto,
  permitirEdicaoFoto = false,
}: {
  produto: ProdutoDetalhe;
  permitirEdicaoFoto?: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [alterandoExibicao, setAlterandoExibicao] = useState(false);

  const atualizarCache = (atualizado: ProdutoDetalhe) => {
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
        atualizado = await apiUpload<ProdutoDetalhe>(
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
        await apiFetch<ProdutoDetalhe>(
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
    try {
      atualizarCache(
        await apiFetch<ProdutoDetalhe>(
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

  const definirExibicao = async (exibir: boolean) => {
    setAlterandoExibicao(true);
    try {
      atualizarCache(
        await apiFetch<ProdutoDetalhe>(`/produtos/${produto.id}`, {
          method: "PATCH",
          body: { exibirFotoOrcamento: exibir },
        }),
      );
      toast.success(
        exibir
          ? "Foto será exibida no orçamento"
          : "Foto ocultada do orçamento",
      );
    } catch (erro) {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : "Erro ao alterar exibição da foto",
      );
    } finally {
      setAlterandoExibicao(false);
    }
  };

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4 sm:col-span-2 lg:col-span-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Fotos do produto</p>
              <p className="text-xs text-muted-foreground">
                A principal aparece no orçamento. PNG ou JPEG, até 5 MB cada.
              </p>
            </div>
            {permitirEdicaoFoto ? (
              <div className="flex flex-wrap items-center gap-3">
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
                <div className="flex items-center gap-2">
                  <Switch
                    id={`exibir-foto-${produto.id}`}
                    checked={produto.exibirFotoOrcamento}
                    disabled={!produto.fotos.length || alterandoExibicao}
                    onCheckedChange={definirExibicao}
                  />
                  <FieldLabel htmlFor={`exibir-foto-${produto.id}`}>
                    Exibir foto no orçamento
                  </FieldLabel>
                </div>
              </div>
            ) : (
              <Badge variant="outline">
                {produto.exibirFotoOrcamento
                  ? "Visível no orçamento"
                  : "Oculta no orçamento"}
              </Badge>
            )}
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
                  {permitirEdicaoFoto ? (
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
                        title="Remover foto"
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
        </div>
        <Info label="Código ERP" value={produto.codigoErp} />
        <Info
          label="Código do fornecedor"
          value={produto.codigoFornecedor || "—"}
        />
        <Info label="Unidade" value={produto.unidade || "—"} />
        <Info label="Marca" value={produto.marca || "—"} />
        <Info label="Código de barras" value={produto.codigoBarras || "—"} />
        <Info label="Categoria" value={produto.categoria?.descricao ?? "—"} />
        <Info
          label="Subcategoria"
          value={produto.subCategoria?.descricao ?? "—"}
        />
        <Info label="Armazém" value={produto.armazem?.descricao ?? "—"} />
        <Info label="NCM" value={produto.ncm || "—"} />
        <Info label="Qtd. embalagem" value={produto.qtdEmbalagem ?? "—"} />
        <Info label="Peso" value={produto.peso ?? "—"} />
        <Info label="Último preço" value={moeda(produto.ultimoPreco)} />
        <Info
          label="Regra de desconto"
          value={regraDescontoLabel(produto.regraDesconto)}
        />
        {produto.observacao && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground">Observação</p>
            <p className="text-sm">{produto.observacao}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cortina lateral com o detalhe do produto — usada dentro da Posição de
 * Cliente (aba Mix) pra não perder a busca/scroll/aba de quem está
 * consultando a posição.
 */
export function ProdutoSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    data: produto,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<ProdutoDetalhe>(`/produtos/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={520}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {produto ? (
              <>
                {produto.descricao}
                <StatusDot active={produto.ativo} />
                {!produto.ativo && <Badge variant="destructive">Inativo</Badge>}
              </>
            ) : (
              "Produto"
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && (
            <p className="text-sm text-muted-foreground">
              Produto não encontrado.
            </p>
          )}
          {produto && <ProdutoDetalheContent produto={produto} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
