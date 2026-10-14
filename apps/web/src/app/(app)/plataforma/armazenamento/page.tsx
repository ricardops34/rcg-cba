"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
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
import { CloudUpload, HardDrive, Loader2, Search, Trash2 } from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

interface ResultadoMidiaOrfa {
  arquivosNaPasta: number;
  referenciados: number;
  recentesIgnorados: number;
  orfaos: number;
  bytesOrfaos: number;
  amostra: string[];
  apagados: number;
  falhas: number;
}

interface SituacaoArmazenamento {
  s3Configurado: boolean;
  bucket: string | null;
  /** null = sem MinIO; "ok" = o bucket responde; senão, o motivo da falha. */
  conexao: string | null;
  pastas: { pasta: string; noDisco: number }[];
}

interface RodadaMigracao {
  copiados: number;
  bytes: number;
  falhas: string[];
  restantes: number;
}

const numero = (v: number) => v.toLocaleString("pt-BR");

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

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold">{valor}</p>
    </div>
  );
}

/**
 * Onde os arquivos estão: disco ou MinIO, por pasta. A troca de pasta é por
 * variável de ambiente (`ARMAZENAMENTO_S3_PASTAS`, ver o runbook); aqui só se
 * vê a situação e se copia para o MinIO o que ficou no disco de antes da troca.
 * A cópia vai em rodadas de até 200 arquivos — cada uma confere o tamanho no
 * MinIO antes de tirar do disco — até zerar ou uma rodada não avançar.
 */
function Situacao() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["plataforma", "armazenamento", "situacao"],
    queryFn: () => apiFetch<SituacaoArmazenamento>("/plataforma/armazenamento/situacao"),
  });
  const [copiando, setCopiando] = useState<string | null>(null);
  const [progresso, setProgresso] = useState({ copiados: 0, bytes: 0, falhas: 0 });

  async function copiar(pasta: string) {
    setCopiando(pasta);
    const total = { copiados: 0, bytes: 0, falhas: 0 };
    setProgresso(total);
    try {
      for (;;) {
        const r = await apiFetch<RodadaMigracao>("/plataforma/armazenamento/migrar", {
          method: "POST",
          body: { pasta },
        });
        total.copiados += r.copiados;
        total.bytes += r.bytes;
        total.falhas = r.falhas.length;
        setProgresso({ ...total });
        // Sem avanço, as que sobraram são falhas: parar em vez de repetir.
        if (r.restantes === 0 || r.copiados === 0) break;
      }
      toast.success(
        `${numero(total.copiados)} arquivos copiados para o MinIO` +
          (total.falhas ? `; ${numero(total.falhas)} ficaram no disco.` : "."),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCopiando(null);
      void queryClient.invalidateQueries({ queryKey: ["plataforma", "armazenamento", "situacao"] });
    }
  }

  if (!data) return null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <h2 className="font-semibold">Onde os arquivos estão</h2>
          <p className="text-sm text-muted-foreground">
            {data.s3Configurado
              ? `MinIO configurado (bucket ${data.bucket}). As pastas abaixo gravam no MinIO; as demais seguem em disco.`
              : "Sem MinIO configurado: todos os arquivos estão em disco, no volume da API."}
          </p>
          {data.conexao === "ok" && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Conexão com o MinIO: OK.</p>
          )}
          {data.conexao && data.conexao !== "ok" && (
            <p className="text-sm text-destructive">Falha na conexão com o MinIO: {data.conexao}</p>
          )}
        </div>
        {data.s3Configurado && data.pastas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma pasta configurada para o MinIO ainda.</p>
        )}
        {data.pastas.map(({ pasta, noDisco }) => (
          <div key={pasta} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm">{pasta}</p>
              <p className="text-xs text-muted-foreground">
                {noDisco === 0
                  ? "Tudo no MinIO."
                  : `${numero(noDisco)} arquivos ainda no disco (servidos normalmente até a cópia).`}
              </p>
              {copiando === pasta && (
                <p className="text-xs text-muted-foreground">
                  Copiados até agora: {numero(progresso.copiados)} ({tamanho(progresso.bytes)})
                </p>
              )}
            </div>
            {noDisco > 0 && (
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={!!copiando}
                onClick={() => void copiar(pasta)}
              >
                {copiando === pasta ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
                Copiar para o MinIO
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Mídia do WhatsApp que nenhum registro referencia: o que as exclusões do
 * histórico deixaram até 2026-10-13, fotos de perfil substituídas e anexos de
 * envios que falharam. Primeiro verifica (não apaga nada); apaga só depois de
 * conferido, com confirmação.
 */
function MidiaOrfa() {
  const [resultado, setResultado] = useState<ResultadoMidiaOrfa | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const varrer = useMutation({
    mutationFn: (apagar: boolean) =>
      apiFetch<ResultadoMidiaOrfa>("/plataforma/armazenamento/midia-orfa", {
        method: "POST",
        body: { apagar },
      }),
    onSuccess: (r, apagar) => {
      if (apagar) {
        toast.success(
          `${numero(r.apagados)} arquivos apagados` +
            (r.falhas ? `; ${numero(r.falhas)} não puderam ser apagados.` : "."),
        );
        setConfirmando(false);
        // Mostra o estado depois de apagar: a próxima verificação deve vir zerada.
        setResultado({ ...r, orfaos: r.falhas, bytesOrfaos: 0, amostra: [] });
      } else {
        setResultado(r);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-semibold">Mídia órfã do WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Arquivos de conversa que nenhuma mensagem nem foto de contato usa mais — sobras das
            exclusões de histórico feitas antes de 13/10/2026, de fotos de perfil trocadas e de
            envios que falharam. Arquivos com menos de 24 h ficam de fora: podem ser de um envio em
            andamento.
          </p>
        </div>

        <Button
          variant="outline"
          className="gap-1.5"
          disabled={varrer.isPending}
          onClick={() => varrer.mutate(false)}
        >
          {varrer.isPending && !confirmando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Verificar
        </Button>

        {resultado && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Arquivos na pasta" valor={numero(resultado.arquivosNaPasta)} />
              <Numero rotulo="Em uso" valor={numero(resultado.referenciados)} />
              <Numero rotulo="Órfãos" valor={numero(resultado.orfaos)} />
              <Numero rotulo="Espaço dos órfãos" valor={tamanho(resultado.bytesOrfaos)} />
            </div>
            {resultado.recentesIgnorados > 0 && (
              <p className="text-xs text-muted-foreground">
                {numero(resultado.recentesIgnorados)} arquivos sem uso com menos de 24 h ficaram de
                fora.
              </p>
            )}
            {resultado.amostra.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Exemplos ({numero(resultado.amostra.length)})
                </summary>
                <ul className="mt-2 space-y-0.5 font-mono">
                  {resultado.amostra.map((nome) => (
                    <li key={nome}>{nome}</li>
                  ))}
                </ul>
              </details>
            )}
            {resultado.orfaos > 0 && resultado.amostra.length > 0 && (
              <Button variant="destructive" className="gap-1.5" onClick={() => setConfirmando(true)}>
                <Trash2 className="size-4" />
                Apagar {numero(resultado.orfaos)} arquivos órfãos
              </Button>
            )}
          </div>
        )}

        <Dialog open={confirmando} onOpenChange={(aberto) => !varrer.isPending && setConfirmando(aberto)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apagar a mídia órfã?</DialogTitle>
              <DialogDescription>
                {resultado ? numero(resultado.orfaos) : 0} arquivos (
                {resultado ? tamanho(resultado.bytesOrfaos) : "0 B"}) serão apagados de vez. Nenhuma
                mensagem os usa. A verificação é refeita no servidor antes de apagar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={varrer.isPending} onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="gap-1.5"
                disabled={varrer.isPending}
                onClick={() => varrer.mutate(true)}
              >
                {varrer.isPending && <Loader2 className="size-4 animate-spin" />}
                Apagar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function PlataformaArmazenamentoPage() {
  return (
    <PlataformaGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <HardDrive className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Armazenamento</h1>
            <p className="text-xs text-muted-foreground">
              Arquivos guardados pela plataforma: mídia do WhatsApp, fichas, fotos e documentos.
            </p>
          </div>
        </div>

        <Situacao />
        <MidiaOrfa />
      </div>
    </PlataformaGuard>
  );
}
