"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  INTEGRACAO_CARGA_ENTIDADES,
  type IntegracaoApiKey,
  type IntegracaoCarga,
  type IntegracaoCargaErrosPage,
  type IntegracaoCargaSituacao,
} from "@plataforma/contracts";
import { apiFetch, apiUpload, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileUp, Loader2, Play, RefreshCw, Trash2, XCircle } from "lucide-react";

/**
 * Carga por arquivo pela tela, em duas abas: **Upload** sobe os arquivos
 * (gerados pelo Protheus ou pelo SQL de docs/integracao/sql) e os deixa
 * aguardando; **Processamento** manda processar e acompanha. Quem grava é a
 * API, em segundo plano no servidor — a janela pode ser fechada depois de
 * mandar processar —, pelo mesmo schema e `upsertLote` do PUT de cada
 * entidade. Ver docs/planos/2026-09-28-carga-por-arquivo.md, *Tela de cargas*.
 */

const CHAVE_CARGAS = ["integracao-cargas"] as const;

/**
 * A ordem em que a plataforma precisa receber as entidades: vendedor antes de
 * cliente, cliente antes de título. Ela processa na ordem de chegada, então é
 * a ordem do upload que decide. A mesma do catálogo do Protheus (BJCATALO).
 */
const ORDEM_CARGA = [
  "regras-desconto",
  "categorias",
  "condicoes-pagamento",
  "armazens",
  "vendedores",
  "fornecedores",
  "produtos",
  "estoque",
  "tabelas-preco",
  "clientes",
  "objetivos",
  "notas-saida",
  "notas-entrada",
  "titulos-receber",
  "orcamentos",
] as const satisfies readonly (typeof INTEGRACAO_CARGA_ENTIDADES)[number][];

/**
 * Posição do arquivo na ordem de carga, pelo nome: `titulos-receber-2025.json`
 * começa por `titulos-receber`. O prefixo mais longo vence. Nome que não casa
 * vai por último — a API lê a entidade de dentro do arquivo, o nome só decide
 * a ordem.
 */
function posicaoNaCarga(nome: string): number {
  const n = nome.toLowerCase();
  let melhor = -1;
  let tamanho = 0;
  ORDEM_CARGA.forEach((entidade, i) => {
    if (n.startsWith(entidade) && entidade.length > tamanho) {
      melhor = i;
      tamanho = entidade.length;
    }
  });
  return melhor === -1 ? ORDEM_CARGA.length : melhor;
}

function ordenarParaCarga(arquivos: File[]): File[] {
  return [...arquivos].sort(
    (a, b) =>
      posicaoNaCarga(a.name) - posicaoNaCarga(b.name) ||
      a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
  );
}

/**
 * Compacta no navegador antes de subir. JSON cai perto de 10×, e a API
 * reconhece o gzip pelos dois primeiros bytes. Arquivo já compactado vai como
 * está.
 */
async function compactar(arquivo: File): Promise<File> {
  if (/\.gz$/i.test(arquivo.name) || typeof CompressionStream === "undefined") {
    return arquivo;
  }
  const fluxo = arquivo.stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(fluxo).blob();
  return new File([blob], `${arquivo.name}.gz`, { type: "application/gzip" });
}

/**
 * Sobe um arquivo; se a API responder 429 (muitas requisições), espera e
 * tenta de novo em vez de parar o envio no meio — 5 s, 10 s, 15 s…
 */
async function subirComEspera(form: FormData, aoEsperar: (segundos: number) => void) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await apiUpload<IntegracaoCarga>("/integracao-cargas", form);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 429) || tentativa >= 6) throw err;
      const segundos = tentativa * 5;
      aoEsperar(segundos);
      await new Promise((r) => setTimeout(r, segundos * 1000));
    }
  }
}

const tamanhoBr = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;

const dataHoraBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

const numeroBr = (n: number) => n.toLocaleString("pt-BR");

const SITUACAO: Record<IntegracaoCargaSituacao, { rotulo: string; classe: string }> = {
  aguardando: { rotulo: "Aguardando", classe: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  recebida: { rotulo: "Na fila", classe: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/20" },
  processando: { rotulo: "Processando", classe: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  concluida: { rotulo: "Concluída", classe: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  cancelada: { rotulo: "Cancelada", classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  erro: { rotulo: "Erro", classe: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

const naFila = (c: IntegracaoCarga) => c.situacao === "recebida" || c.situacao === "processando";

function useCargas() {
  return useQuery({
    queryKey: CHAVE_CARGAS,
    queryFn: () => apiFetch<IntegracaoCarga[]>("/integracao-cargas"),
    // Atualiza sozinha enquanto houver carga na fila ou rodando
    refetchInterval: (query) => ((query.state.data ?? []).some(naFila) ? 5000 : false),
  });
}

// ===========================================================================
// UPLOAD
// ===========================================================================

type EstadoEnvio = "aguardando" | "compactando" | "enviando" | "enviado" | "erro";

interface ArquivoNaFila {
  arquivo: File;
  estado: EstadoEnvio;
  mensagem?: string;
}

export function UploadCargasTab({ onEnviados }: { onEnviados?: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKeyId, setApiKeyId] = useState<string>("");
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const [enviando, setEnviando] = useState(false);

  // A carga fica em nome de uma chave da empresa: os registros levam a
  // autoria da integração, como os que o ERP manda.
  const chavesQuery = useQuery({
    queryKey: ["integracao-keys", "ativas"],
    queryFn: () =>
      apiFetch<{ data: IntegracaoApiKey[] }>("/integracao-keys", {
        query: { ativo: true, pageSize: 100, sortBy: "nome", sortOrder: "asc" },
      }),
  });
  const chaves = chavesQuery.data?.data ?? [];
  const chaveEscolhida = apiKeyId || (chaves.length === 1 ? chaves[0].id : "");

  const escolherArquivos = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    setFila(ordenarParaCarga(Array.from(lista)).map((arquivo) => ({ arquivo, estado: "aguardando" })));
  };

  const marcar = (i: number, estado: EstadoEnvio, mensagem?: string) =>
    setFila((atual) => atual.map((f, j) => (j === i ? { ...f, estado, mensagem } : f)));

  // Um por vez e na ordem de carga: é a ordem de chegada que o processamento
  // segue. Um recusado para o envio — os seguintes podem depender dele.
  const enviar = async () => {
    if (!chaveEscolhida) {
      toast.error("Escolha a chave de API em nome da qual a carga fica.");
      return;
    }
    setEnviando(true);
    let enviados = 0;
    try {
      for (let i = 0; i < fila.length; i++) {
        if (fila[i].estado === "enviado") continue;
        const original = fila[i].arquivo;
        try {
          marcar(i, "compactando");
          const arquivo = await compactar(original);
          marcar(i, "enviando");
          const form = new FormData();
          form.append("file", arquivo);
          form.append("apiKeyId", chaveEscolhida);
          form.append("descricao", original.name);
          await subirComEspera(form, (s) => marcar(i, "enviando", `Servidor ocupado, tentando de novo em ${s} s`));
          marcar(i, "enviado");
          enviados++;
          queryClient.invalidateQueries({ queryKey: CHAVE_CARGAS });
        } catch (err) {
          const mensagem = err instanceof ApiError ? err.message : "Falha no envio";
          marcar(i, "erro", mensagem);
          toast.error(`${original.name}: ${mensagem}. Os arquivos seguintes não foram enviados.`);
          return;
        }
      }
      if (enviados > 0) {
        toast.success(`${enviados} arquivo(s) enviado(s). Mande processar na aba Processamento.`);
        onEnviados?.();
      }
    } finally {
      setEnviando(false);
    }
  };

  const pendentes = fila.filter((f) => f.estado !== "enviado").length;

  return (
    <Card className="border-border/70 shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="font-medium">Upload de arquivos de carga</p>
          <p className="text-sm text-muted-foreground">
            Arquivos JSON gerados pelo Protheus ou pelo SQL, um registro por linha. Escolha vários
            de uma vez: eles sobem um por um, na ordem de carga (vendedores antes de clientes,
            clientes antes de títulos), e ficam <strong>aguardando</strong> — o processamento é
            na aba Processamento. Mantenha esta janela aberta até o upload terminar.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cargaChave">Chave de API</FieldLabel>
            <Select value={chaveEscolhida} onValueChange={setApiKeyId} disabled={enviando}>
              <SelectTrigger id="cargaChave" className="w-full">
                <SelectValue placeholder={chavesQuery.isLoading ? "Carregando…" : "Escolha a chave"} />
              </SelectTrigger>
              <SelectContent>
                {chaves.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({c.prefixo}…)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Os registros gravados ficam em nome desta integração.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="cargaArquivos">Arquivos</FieldLabel>
            <input
              ref={inputRef}
              id="cargaArquivos"
              type="file"
              multiple
              accept=".json,.jsonl,.txt,.gz"
              className="hidden"
              onChange={(e) => {
                escolherArquivos(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="size-4" />
              {fila.length > 0 ? `${fila.length} arquivo(s) escolhido(s)` : "Escolher arquivos"}
            </Button>
          </Field>
        </div>

        {fila.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="w-28 text-right">Tamanho</TableHead>
                  <TableHead className="w-64">Upload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fila.map((f, i) => (
                  <TableRow key={`${f.arquivo.name}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{f.arquivo.name}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {tamanhoBr(f.arquivo.size)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {f.estado === "aguardando" && <span className="text-muted-foreground">Na vez</span>}
                      {f.estado === "compactando" && (
                        <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Compactando</span>
                      )}
                      {f.estado === "enviando" && (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" /> {f.mensagem ?? "Enviando"}
                        </span>
                      )}
                      {f.estado === "enviado" && <span className="text-emerald-600 dark:text-emerald-400">Enviado</span>}
                      {f.estado === "erro" && <span className="text-rose-600 dark:text-rose-400">{f.mensagem}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {fila.length > 0 && (
            <Button type="button" variant="ghost" disabled={enviando} onClick={() => setFila([])}>
              Limpar
            </Button>
          )}
          <Button type="button" disabled={enviando || pendentes === 0 || !chaveEscolhida} onClick={enviar}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {enviando ? "Enviando…" : `Enviar ${pendentes || ""} arquivo(s)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// PROCESSAMENTO
// ===========================================================================

export function ProcessamentoCargasTab() {
  const queryClient = useQueryClient();
  const cargasQuery = useCargas();
  const cargas = cargasQuery.data ?? [];
  const aguardando = cargas.filter((c) => c.situacao === "aguardando");
  const [cargaErros, setCargaErros] = useState<IntegracaoCarga | null>(null);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_CARGAS });

  const processar = useMutation({
    mutationFn: (ids?: string[]) =>
      apiFetch<{ liberadas: number }>("/integracao-cargas/processar", {
        method: "POST",
        body: ids ? { ids } : {},
      }),
    onSuccess: atualizar,
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      apiFetch<IntegracaoCarga>(`/integracao-cargas/${id}/cancelar`, { method: "POST" }),
    onSuccess: atualizar,
  });

  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/integracao-cargas/${id}`, { method: "DELETE" }),
    onSuccess: atualizar,
  });

  const mandarProcessar = async (ids?: string[]) => {
    try {
      const { liberadas } = await processar.mutateAsync(ids);
      toast.success(
        `${liberadas} carga(s) na fila. O processamento segue no servidor — pode fechar a janela.`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao mandar processar");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Processamento das cargas</p>
          <p className="text-sm text-muted-foreground">
            O processamento roda no servidor, um arquivo por vez, na ordem em que foram subidos.
            Depois de mandar processar, pode fechar a janela; volte aqui para acompanhar.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => cargasQuery.refetch()}
            disabled={cargasQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${cargasQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={aguardando.length === 0 || processar.isPending}
            onClick={() => mandarProcessar()}
          >
            {processar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Processar {aguardando.length > 0 ? `${aguardando.length} aguardando` : ""}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead className="w-32">Situação</TableHead>
              <TableHead className="w-56">Progresso</TableHead>
              <TableHead className="w-40 text-right">Criados / Atualizados</TableHead>
              <TableHead className="w-24 text-right">Erros</TableHead>
              <TableHead className="w-40">Subida em</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargasQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!cargasQuery.isLoading && cargas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Nenhuma carga ainda. Suba os arquivos na aba Upload.
                </TableCell>
              </TableRow>
            )}
            {cargas.map((c) => {
              const pct = c.totalLinhas > 0 ? Math.min(100, (c.linhasProcessadas / c.totalLinhas) * 100) : 0;
              const situacao = SITUACAO[c.situacao];
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-mono text-xs">{c.descricao ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(c.entidades)
                        .map(([e, n]) => `${e}: ${numeroBr(n)}`)
                        .join(" · ")}
                    </p>
                    {c.mensagem && <p className="text-xs text-rose-600 dark:text-rose-400">{c.mensagem}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={situacao.classe}>
                      {situacao.rotulo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {numeroBr(c.linhasProcessadas)} de {numeroBr(c.totalLinhas)} ({Math.floor(pct)}%)
                    </p>
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {numeroBr(c.criados)} / {numeroBr(c.atualizados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.erros > 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-rose-600 dark:text-rose-400"
                        onClick={() => setCargaErros(c)}
                      >
                        {numeroBr(c.erros)}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dataHoraBr(c.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {c.situacao === "aguardando" && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Processar só esta"
                            disabled={processar.isPending}
                            onClick={() => mandarProcessar([c.id])}
                          >
                            <Play className="size-4 text-primary" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Excluir (subida por engano)"
                            disabled={excluir.isPending}
                            onClick={async () => {
                              if (!confirm(`Excluir "${c.descricao ?? c.id}"? O arquivo não foi processado.`)) return;
                              try {
                                await excluir.mutateAsync(c.id);
                                toast.success("Carga excluída");
                              } catch (err) {
                                toast.error(err instanceof ApiError ? err.message : "Erro ao excluir");
                              }
                            }}
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                      {naFila(c) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Cancelar"
                          disabled={cancelar.isPending}
                          onClick={async () => {
                            if (!confirm(`Cancelar "${c.descricao ?? c.id}"? O que já foi gravado fica.`)) return;
                            try {
                              await cancelar.mutateAsync(c.id);
                              toast.success("Cancelamento solicitado");
                            } catch (err) {
                              toast.error(err instanceof ApiError ? err.message : "Erro ao cancelar");
                            }
                          }}
                        >
                          <XCircle className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {cargaErros && <ErrosDialog carga={cargaErros} onClose={() => setCargaErros(null)} />}
    </div>
  );
}

function ErrosDialog({ carga, onClose }: { carga: IntegracaoCarga; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const errosQuery = useQuery({
    queryKey: [...CHAVE_CARGAS, carga.id, "erros", page],
    queryFn: () =>
      apiFetch<IntegracaoCargaErrosPage>(`/integracao-cargas/${carga.id}/erros`, {
        query: { page, pageSize: 100 },
      }),
  });
  const pagina = errosQuery.data;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registros recusados — {carga.descricao ?? carga.id}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Linha</TableHead>
                <TableHead className="w-36">Entidade</TableHead>
                <TableHead className="w-56">Chave</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errosQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {(pagina?.data ?? []).map((e) => (
                <TableRow key={`${e.linha}-${e.chave}`}>
                  <TableCell className="text-xs">{numeroBr(e.linha)}</TableCell>
                  <TableCell className="text-xs">{e.entidade}</TableCell>
                  <TableCell className="font-mono text-xs">{e.chave ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.mensagem}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {pagina ? `${numeroBr(pagina.total)} recusados · página ${pagina.page} de ${Math.max(1, pagina.totalPages)}` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagina || page >= pagina.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
            <Button type="button" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
