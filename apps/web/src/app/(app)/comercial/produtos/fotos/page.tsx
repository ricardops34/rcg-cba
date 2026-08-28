"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Produto,
  ProdutoFotoCriterio,
  ProdutoFotoImportacaoItem,
} from "@plataforma/contracts";
import { ArrowLeft, Images, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";

type FotoPendente = {
  id: string;
  url: string;
  nomeArquivo: string;
};

export default function ProdutoFotosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [criterio, setCriterio] = useState<ProdutoFotoCriterio>("codigo_erp");
  const [resultado, setResultado] = useState<ProdutoFotoImportacaoItem[]>([]);
  const [selecionados, setSelecionados] = useState<
    Record<string, Produto | null>
  >({});

  const pendentes = useQuery({
    queryKey: ["produto-fotos", "pendentes"],
    queryFn: () => apiFetch<FotoPendente[]>("/produto-fotos/pendentes"),
  });

  const importar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const form = new FormData();
      arquivos.forEach((arquivo) => form.append("files", arquivo));
      return apiUpload<ProdutoFotoImportacaoItem[]>(
        `/produto-fotos/importar?criterio=${criterio}`,
        form,
      );
    },
    onSuccess: (itens) => {
      setResultado(itens);
      void queryClient.invalidateQueries({
        queryKey: ["produto-fotos", "pendentes"],
      });
      const vinculadas = itens.filter(
        (item) => item.situacao === "vinculada",
      ).length;
      toast.success(
        `${vinculadas} de ${itens.length} foto(s) associada(s) automaticamente`,
      );
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError ? erro.message : "Falha ao importar fotos",
      ),
  });

  const vincular = async (fotoId: string) => {
    const produto = selecionados[fotoId];
    if (!produto) return;
    try {
      await apiFetch(`/produto-fotos/${fotoId}/vincular`, {
        method: "POST",
        body: { produtoId: produto.id },
      });
      setSelecionados((atual) => ({ ...atual, [fotoId]: null }));
      void pendentes.refetch();
      toast.success(`Foto associada a ${produto.codigoErp}`);
    } catch (erro) {
      toast.error(
        erro instanceof ApiError ? erro.message : "Falha ao associar foto",
      );
    }
  };

  const remover = async (fotoId: string) => {
    if (!window.confirm("Remover definitivamente esta foto pendente?")) return;
    try {
      await apiFetch(`/produto-fotos/${fotoId}`, { method: "DELETE" });
      void pendentes.refetch();
      toast.success("Foto pendente removida");
    } catch (erro) {
      toast.error(
        erro instanceof ApiError ? erro.message : "Falha ao remover foto",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/comercial/produtos")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Importar fotos de produtos
          </h1>
          <p className="text-sm text-muted-foreground">
            Associe pelo nome do arquivo ou revise manualmente.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 space-y-1">
              <p className="text-sm font-medium">Critério do nome do arquivo</p>
              <Select
                value={criterio}
                onValueChange={(value) =>
                  setCriterio(value as ProdutoFotoCriterio)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="codigo_erp">Código ERP</SelectItem>
                  <SelectItem value="codigo_fornecedor">
                    Código do fornecedor
                  </SelectItem>
                  <SelectItem value="manual">Associação manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const arquivos = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (arquivos.length) importar.mutate(arquivos);
              }}
            />
            <Button
              disabled={importar.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" />
              {importar.isPending ? "Importando..." : "Selecionar fotos"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use o código como nome, por exemplo 11400443.jpg. Para fotos
            adicionais, use 11400443_2.jpg. Arquivos sem correspondência ficam
            na fila manual.
          </p>
          {resultado.length ? (
            <div className="rounded-md border p-3 text-sm">
              {resultado.map((item) => (
                <p key={item.id}>
                  {item.nomeArquivo}:{" "}
                  {item.situacao === "vinculada"
                    ? `associada a ${item.produto?.codigoErp}`
                    : "aguardando vínculo manual"}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Fotos aguardando associação ({pendentes.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendentes.data?.length ? (
            <div className="space-y-3">
              {pendentes.data.map((foto) => (
                <div
                  key={foto.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(foto.url) ?? ""}
                    alt={foto.nomeArquivo}
                    className="size-20 rounded-md border object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {foto.nomeArquivo}
                    </p>
                    <ProdutoCombobox
                      value={selecionados[foto.id]?.id ?? null}
                      onChange={(produto) =>
                        setSelecionados((atual) => ({
                          ...atual,
                          [foto.id]: produto,
                        }))
                      }
                    />
                  </div>
                  <Button
                    disabled={!selecionados[foto.id]}
                    onClick={() => vincular(foto.id)}
                  >
                    Associar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover"
                    onClick={() => remover(foto.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Images className="size-8" />
              <p className="text-sm">Nenhuma foto aguardando associação.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
