"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
  BackupsDaEmpresa,
  algumGerando,
  type Backup,
} from "@/components/backup/backups-da-empresa";
import { Archive, Loader2 } from "lucide-react";

/**
 * Backup da própria empresa (Administração > Backups) — só o administrador
 * dela. A API usa sempre a empresa ativa do login, então trocar de empresa no
 * topo troca a lista. O agendamento é da plataforma; aqui aparecem também os
 * backups agendados, e dá para gerar um na hora.
 */
export default function BackupsPage() {
  const empresaAtivaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const empresa = useAuthStore((s) =>
    s.user?.empresas.find((e) => e.empresaId === s.user?.empresaAtivaId),
  );
  // A empresa ativa na chave: trocar de empresa no topo recarrega a lista.
  const chave = ["backups", empresaAtivaId];
  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => apiFetch<Backup[]>("/backups"),
    refetchInterval: (q) => (q.state.data && algumGerando(q.state.data) ? 5000 : false),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
          <Archive className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Backups</h1>
          <p className="text-xs text-muted-foreground">
            Um pacote com os dados da empresa (planilhas e JSON) e os arquivos dela — mídia do
            WhatsApp, fichas, fotos. Só desta empresa; senhas e chaves de acesso não entram. O link
            de download vale 5 minutos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <BackupsDaEmpresa
          titulo={empresa?.nomeFantasia}
          backups={data ?? []}
          base="/backups"
          queryKey={chave}
        />
      )}
    </div>
  );
}
