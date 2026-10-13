"use client";

import { useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, assetUrl } from "@/lib/api-client";
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
import { Download, Loader2, Play, Trash2 } from "lucide-react";

export interface Backup {
  id: string;
  empresaId: string;
  origem: "manual" | "agendado";
  situacao: "gerando" | "pronto" | "falhou";
  bytes: number | null;
  registros: number | null;
  arquivos: number | null;
  erro: string | null;
  iniciadoEm: string;
  concluidoEm: string | null;
}

const numero = (v: number) => v.toLocaleString("pt-BR");

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function tamanho(bytes: number) {
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${unidades[i]}`;
}

/** Algum backup da lista ainda gerando — a tela atualiza sozinha enquanto isso. */
export const algumGerando = (backups: Backup[]) => backups.some((b) => b.situacao === "gerando");

function Situacao({ backup }: { backup: Backup }) {
  if (backup.situacao === "gerando") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Gerando
      </Badge>
    );
  }
  if (backup.situacao === "falhou") {
    return (
      <Badge variant="destructive" title={backup.erro ?? undefined}>
        Falhou
      </Badge>
    );
  }
  return <Badge variant="secondary">Pronto</Badge>;
}

/**
 * Os backups de uma empresa, com Gerar agora, Baixar e Excluir. Usado pela
 * Plataforma (uma por empresa, `base` = `/plataforma/backups/<empresaId>`) e
 * pelo administrador da empresa (`base` = `/backups`, a empresa ativa). As
 * rotas seguem o mesmo desenho nos dois: `POST base`, `GET base/<id>/link`,
 * `DELETE base/<id>`.
 */
export function BackupsDaEmpresa({
  titulo,
  subtitulo,
  backups,
  base,
  queryKey,
}: {
  titulo?: string;
  subtitulo?: string;
  backups: Backup[];
  base: string;
  /** O que recarregar depois de gerar ou excluir. */
  queryKey: QueryKey;
}) {
  const queryClient = useQueryClient();
  const [excluindo, setExcluindo] = useState<Backup | null>(null);
  const atualizar = () => void queryClient.invalidateQueries({ queryKey });

  const gerar = useMutation({
    mutationFn: () => apiFetch<Backup>(base, { method: "POST" }),
    onSuccess: () => {
      toast.success("Backup em geração. A lista atualiza quando terminar.");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baixar = useMutation({
    mutationFn: (b: Backup) => apiFetch<{ url: string }>(`${base}/${b.id}/link`),
    onSuccess: ({ url }) => {
      const endereco = assetUrl(url);
      if (endereco) window.location.assign(endereco);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: (b: Backup) => apiFetch(`${base}/${b.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Backup excluído.");
      setExcluindo(null);
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerando = algumGerando(backups);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            {titulo && <p className="truncate font-semibold">{titulo}</p>}
            {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
          </div>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={gerando || gerar.isPending}
            onClick={() => gerar.mutate()}
          >
            <Play className="size-4" />
            Gerar agora
          </Button>
        </div>

        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum backup ainda.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-36">{dataHora(b.iniciadoEm)}</span>
                <Badge variant="outline">{b.origem === "manual" ? "Manual" : "Agendado"}</Badge>
                <Situacao backup={b} />
                <span className="flex-1 text-xs text-muted-foreground">
                  {b.situacao === "pronto" &&
                    `${tamanho(b.bytes ?? 0)} · ${numero(b.registros ?? 0)} registros · ${numero(
                      b.arquivos ?? 0,
                    )} arquivos`}
                  {b.situacao === "falhou" && b.erro}
                </span>
                {b.situacao === "pronto" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Baixar"
                    aria-label="Baixar"
                    disabled={baixar.isPending}
                    onClick={() => baixar.mutate(b)}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
                {b.situacao !== "gerando" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Excluir"
                    aria-label="Excluir"
                    onClick={() => setExcluindo(b)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!excluindo} onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir este backup?</DialogTitle>
              <DialogDescription>
                O pacote de {excluindo ? dataHora(excluindo.iniciadoEm) : ""} é apagado de vez. Os
                dados da empresa na plataforma não mudam.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExcluindo(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={excluir.isPending}
                onClick={() => excluindo && excluir.mutate(excluindo)}
              >
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
