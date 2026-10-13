"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, assetUrl } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, Download, Loader2, Play, Trash2 } from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

interface Backup {
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

interface EmpresaComBackups {
  empresa: { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string };
  backups: Backup[];
}

interface BackupConfig {
  ativo: boolean;
  frequenciaDias: number;
  manter: number;
}

const CHAVE = ["plataforma", "backups"];

const numero = (v: number) => v.toLocaleString("pt-BR");

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function tamanho(bytes: number) {
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${unidades[i]}`;
}

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

/** O agendamento: um só para todas as empresas (decisão de 2026-10-13). */
function Agendamento() {
  const { data } = useQuery({
    queryKey: [...CHAVE, "config"],
    queryFn: () => apiFetch<BackupConfig>("/plataforma/backups/config"),
  });
  if (!data) return null;
  return <AgendamentoForm inicial={data} />;
}

function AgendamentoForm({ inicial }: { inicial: BackupConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BackupConfig>({
    ativo: inicial.ativo,
    frequenciaDias: inicial.frequenciaDias,
    manter: inicial.manter,
  });

  const salvar = useMutation({
    mutationFn: (valor: BackupConfig) =>
      apiFetch<BackupConfig>("/plataforma/backups/config", { method: "PATCH", body: valor }),
    onSuccess: () => {
      toast.success("Agendamento salvo.");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE, "config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-semibold">Backup agendado</h2>
          <p className="text-sm text-muted-foreground">
            Vale para todas as empresas. Cada uma ganha um backup quando o último agendado passa da
            frequência; os mais antigos que a quantidade a guardar são apagados. Backups gerados à mão
            ficam até alguém excluir.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="backup-ativo"
              checked={form.ativo}
              onCheckedChange={(ativo) => setForm({ ...form, ativo })}
            />
            <Label htmlFor="backup-ativo">Ligado</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="backup-frequencia">A cada (dias)</Label>
            <Input
              id="backup-frequencia"
              type="number"
              min={1}
              max={90}
              className="w-28"
              value={form.frequenciaDias}
              onChange={(e) => setForm({ ...form, frequenciaDias: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="backup-manter">Guardar os últimos</Label>
            <Input
              id="backup-manter"
              type="number"
              min={1}
              max={52}
              className="w-28"
              value={form.manter}
              onChange={(e) => setForm({ ...form, manter: Number(e.target.value) })}
            />
          </div>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(form)}>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Empresas() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: CHAVE,
    queryFn: () => apiFetch<EmpresaComBackups[]>("/plataforma/backups"),
    // Enquanto algum gera, atualiza sozinho.
    refetchInterval: (q) =>
      q.state.data?.some((e) => e.backups.some((b) => b.situacao === "gerando")) ? 5000 : false,
  });
  const [excluindo, setExcluindo] = useState<Backup | null>(null);

  const atualizar = () => void queryClient.invalidateQueries({ queryKey: CHAVE });

  const gerar = useMutation({
    mutationFn: (empresaId: string) =>
      apiFetch<Backup>(`/plataforma/backups/${empresaId}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Backup em geração. A lista atualiza quando terminar.");
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baixar = useMutation({
    mutationFn: (b: Backup) =>
      apiFetch<{ url: string }>(`/plataforma/backups/${b.empresaId}/${b.id}/link`),
    onSuccess: ({ url }) => {
      const endereco = assetUrl(url);
      if (endereco) window.location.assign(endereco);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: (b: Backup) =>
      apiFetch(`/plataforma/backups/${b.empresaId}/${b.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Backup excluído.");
      setExcluindo(null);
      atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {(data ?? []).map(({ empresa, backups }) => {
        const gerando = backups.some((b) => b.situacao === "gerando");
        return (
          <Card key={empresa.id}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{empresa.nomeFantasia || empresa.razaoSocial}</p>
                  <p className="text-xs text-muted-foreground">
                    {empresa.razaoSocial} · {empresa.cnpj}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={gerando || gerar.isPending}
                  onClick={() => gerar.mutate(empresa.id)}
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
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!excluindo} onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir este backup?</DialogTitle>
            <DialogDescription>
              O pacote de {excluindo ? dataHora(excluindo.iniciadoEm) : ""} é apagado de vez. Os dados
              da empresa na plataforma não mudam.
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
    </div>
  );
}

/**
 * Backup por empresa — ver `docs/planos/2026-10-13-backup-por-empresa.md`.
 * O pacote (zip) traz os dados em JSONL e CSV e os arquivos da empresa, sem
 * senhas nem credenciais. O link de download vale 5 minutos.
 */
export default function PlataformaBackupsPage() {
  return (
    <PlataformaGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <Archive className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Backups de empresas</h1>
            <p className="text-xs text-muted-foreground">
              Um pacote por empresa com os dados (planilhas e JSON) e os arquivos — para entregar ao
              cliente ou restaurar. Senhas e chaves de acesso não entram.
            </p>
          </div>
        </div>

        <Agendamento />
        <Empresas />
      </div>
    </PlataformaGuard>
  );
}
