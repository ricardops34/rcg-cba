"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  FichaImportacao,
  FichaImportacaoResumo,
  Produto,
} from "@plataforma/contracts";
import { FICHA_IMPORTACAO_LABEL } from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload } from "@/lib/api-client";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Importação em lote de fichas técnicas.
 *
 * **O vínculo é pelo conteúdo do PDF, não pelo nome do arquivo** — é a
 * diferença para a importação de fotos, que fica na tela vizinha. O fabricante
 * manda a ficha com o nome de catálogo dele; o código que interessa está
 * impresso na página.
 *
 * O upload devolve na hora e o processamento acontece em segundo plano: cada
 * PDF é uma leitura paga do modelo. A tela acompanha enquanto houver fila, e
 * para de perguntar quando não há mais nada em andamento — não adianta bater no
 * servidor de meio em meio segundo esperando trabalho que não existe.
 */

const EM_ANDAMENTO = new Set(["pendente", "processando"]);
const PRECISA_DECISAO = new Set(["sem_correspondencia", "ambiguo"]);

const tamanhoBr = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function ProdutoFichasImportacaoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Record<string, Produto | null>>(
    {},
  );
  const [aberta, setAberta] = useState<string | null>(null);

  const resumo = useQuery({
    queryKey: ["produto-fichas-importacao", "resumo"],
    queryFn: () =>
      apiFetch<FichaImportacaoResumo>("/produto-fichas-importacao/resumo"),
    // Só fica perguntando enquanto há o que acompanhar.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.pendentes + d.processando > 0 ? 4000 : false;
    },
  });

  const emAndamento =
    (resumo.data?.pendentes ?? 0) + (resumo.data?.processando ?? 0) > 0;

  const lista = useQuery({
    queryKey: ["produto-fichas-importacao"],
    queryFn: () => apiFetch<FichaImportacao[]>("/produto-fichas-importacao"),
    refetchInterval: emAndamento ? 4000 : false,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({
      queryKey: ["produto-fichas-importacao"],
    });
    void queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const enviar = async (arquivos: File[]) => {
    if (!arquivos.length) return;
    setEnviando(true);
    try {
      const form = new FormData();
      arquivos.forEach((a) => form.append("files", a));
      await apiUpload("/produto-fichas-importacao/importar", form);
      toast.success(
        `${arquivos.length} arquivo(s) na fila. A leitura começa em instantes.`,
      );
      invalidar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não consegui enviar os PDFs",
      );
    } finally {
      setEnviando(false);
    }
  };

  const vincular = useMutation({
    mutationFn: ({ id, produtoId }: { id: string; produtoId: string }) =>
      apiFetch(`/produto-fichas-importacao/${id}/vincular`, {
        method: "POST",
        body: { produtoId },
      }),
    onSuccess: () => {
      toast.success("Ficha vinculada ao produto");
      invalidar();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não consegui vincular"),
  });

  const descartar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/produto-fichas-importacao/${id}`, { method: "DELETE" }),
    onSuccess: invalidar,
  });

  const limpar = useMutation({
    mutationFn: () =>
      apiFetch<{ removidos: number }>(
        "/produto-fichas-importacao/concluidos/limpar",
        { method: "DELETE" },
      ),
    onSuccess: (r) => {
      toast.success(`${r.removidos} concluído(s) saíram da lista`);
      invalidar();
    },
  });

  const itens = lista.data ?? [];
  const pendentesDeDecisao = useMemo(
    () => itens.filter((i) => PRECISA_DECISAO.has(i.situacao)),
    [itens],
  );

  return (
    <div data-tour="rotina" className="space-y-4">
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
            Fichas técnicas em lote
          </h1>
          <p className="text-sm text-muted-foreground">
            O produto é identificado pelo <strong>conteúdo</strong> de cada PDF
            — não pelo nome do arquivo.
          </p>
        </div>
      </div>

      <Card data-tour="fichas-importar">
        <CardContent className="space-y-3 p-4">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = "";
              void enviar(arquivos);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" />
              {enviando ? "Enviando..." : "Escolher PDFs"}
            </Button>
            {(resumo.data?.vinculadas ?? 0) > 0 && (
              <Button
                variant="outline"
                disabled={limpar.isPending}
                onClick={() => limpar.mutate()}
              >
                Limpar concluídos
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Até 100 PDFs por vez, 10 MB cada. Cada arquivo é lido uma vez pelo
            assistente, que transcreve o conteúdo e procura o produto no
            catálogo. PDF digitalizado (sem texto) não tem o que transcrever e
            aparece aqui como falha.
          </p>

          {resumo.data && (
            <div className="flex flex-wrap gap-3 text-sm">
              {emAndamento && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {resumo.data.pendentes + resumo.data.processando} na fila
                </span>
              )}
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {resumo.data.vinculadas} vinculada(s)
              </span>
              {resumo.data.precisamDecisao > 0 && (
                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <CircleAlert className="size-3.5" />
                  {resumo.data.precisamDecisao} esperando você
                </span>
              )}
              {resumo.data.erros > 0 && (
                <span className="text-destructive">
                  {resumo.data.erros} com falha
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {pendentesDeDecisao.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {pendentesDeDecisao.length} ficha(s) já foram lidas, mas o produto não
          ficou claro. Escolha abaixo — o texto já está extraído e não será lido
          de novo.
        </p>
      )}

      {lista.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : itens.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum PDF enviado ainda.
          </CardContent>
        </Card>
      ) : (
        <div data-tour="fichas-resultados" className="space-y-2">
          {itens.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {item.arquivoNome}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tamanhoBr(item.tamanho)}
                  </span>
                  <Badge
                    variant={
                      item.situacao === "vinculada"
                        ? "outline"
                        : item.situacao === "erro"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {EM_ANDAMENTO.has(item.situacao) && (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    )}
                    {FICHA_IMPORTACAO_LABEL[item.situacao]}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    title="Descartar da lista"
                    disabled={descartar.isPending}
                    onClick={() => descartar.mutate(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {/* O que o modelo leu no documento. É isto que explica à pessoa
                    por que a ficha ficou parada. */}
                {(item.codigoDetectado || item.nomeDetectado) && (
                  <p className="text-xs text-muted-foreground">
                    Lido no PDF:{" "}
                    {item.codigoDetectado && (
                      <span className="font-mono">{item.codigoDetectado}</span>
                    )}
                    {item.codigoDetectado && item.nomeDetectado && " · "}
                    {item.nomeDetectado}
                  </p>
                )}

                {item.situacao === "vinculada" && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Produto: </span>
                    <span className="font-mono text-xs">
                      {item.produtoCodigoErp}
                    </span>{" "}
                    {item.produtoDescricao}
                  </p>
                )}

                {item.erro && (
                  <p className="text-sm text-destructive">{item.erro}</p>
                )}

                {PRECISA_DECISAO.has(item.situacao) && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <div className="min-w-64 flex-1">
                      <ProdutoCombobox
                        value={escolhidos[item.id]?.id ?? null}
                        onChange={(p) =>
                          setEscolhidos((e) => ({ ...e, [item.id]: p }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!escolhidos[item.id] || vincular.isPending}
                      onClick={() => {
                        const produto = escolhidos[item.id];
                        if (produto) {
                          vincular.mutate({
                            id: item.id,
                            produtoId: produto.id,
                          });
                        }
                      }}
                    >
                      Vincular
                    </Button>
                  </div>
                )}

                {item.markdown && (
                  <>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        setAberta((a) => (a === item.id ? null : item.id))
                      }
                    >
                      {aberta === item.id
                        ? "Ocultar o texto extraído"
                        : "Ver o texto extraído"}
                    </Button>
                    {aberta === item.id && (
                      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                        {item.markdown}
                      </pre>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
