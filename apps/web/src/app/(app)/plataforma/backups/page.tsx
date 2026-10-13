"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Archive, Loader2 } from "lucide-react";
import {
  BackupsDaEmpresa,
  algumGerando,
  type Backup,
} from "@/components/backup/backups-da-empresa";
import { PlataformaGuard } from "../plataforma-guard";

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
  const { data, isLoading } = useQuery({
    queryKey: CHAVE,
    queryFn: () => apiFetch<EmpresaComBackups[]>("/plataforma/backups"),
    // Enquanto algum gera, atualiza sozinho.
    refetchInterval: (q) => (q.state.data?.some((e) => algumGerando(e.backups)) ? 5000 : false),
  });

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {(data ?? []).map(({ empresa, backups }) => (
        <BackupsDaEmpresa
          key={empresa.id}
          titulo={empresa.nomeFantasia || empresa.razaoSocial}
          subtitulo={`${empresa.razaoSocial} · ${empresa.cnpj}`}
          backups={backups}
          base={`/plataforma/backups/${empresa.id}`}
          queryKey={CHAVE}
        />
      ))}
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
