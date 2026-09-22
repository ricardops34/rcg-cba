"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import type {
  CurrentUser,
  TermoAceiteInput,
  TermoDocumento,
  TermosStatus,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FirstAccessForm } from "@/components/perfil/first-access-form";

export function PlataformaAccessGate({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);

  const usuarioQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
    enabled: !!accessToken,
  });
  const termosQuery = useQuery({
    queryKey: ["termos", "status"],
    queryFn: () => apiFetch<TermosStatus>("/termos/status"),
    enabled: !!accessToken,
  });

  if (usuarioQuery.isLoading || termosQuery.isLoading) {
    return <GateLoading />;
  }
  if (usuarioQuery.isError || termosQuery.isError) {
    return (
      <GateError
        erro={usuarioQuery.error ?? termosQuery.error}
        onRetry={() => {
          void usuarioQuery.refetch();
          void termosQuery.refetch();
        }}
      />
    );
  }
  if (usuarioQuery.data?.mustChangePassword) {
    return (
      <GateFrame>
        <div className="mx-auto w-full max-w-md space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">Proteja sua conta</h1>
            <p className="text-sm text-muted-foreground">
              Troque a senha provisória ou expirada antes de continuar.
            </p>
          </div>
          <ChangePasswordForm />
        </div>
      </GateFrame>
    );
  }

  const termo = termosQuery.data?.pendentes[0];
  if (termo) return <TermoObrigatorio key={termo.id} termo={termo} />;

  if (usuarioQuery.data?.mustCompleteFirstAccess) {
    return <GateFrame><div className="w-full max-w-md space-y-4">
      <FirstAccessForm key={`${usuarioQuery.data.id}:${usuarioQuery.data.empresaAtivaId}`} user={usuarioQuery.data} />
      <SairButton />
    </div></GateFrame>;
  }

  return children;
}

function TermoObrigatorio({ termo }: { termo: TermoDocumento }) {
  const [concordou, setConcordou] = useState(false);
  const queryClient = useQueryClient();
  const aceitar = useMutation({
    mutationFn: (input: TermoAceiteInput) =>
      apiFetch(`/termos/${termo.id}/aceite`, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["termos", "status"] });
    },
  });

  return (
    <GateFrame>
      <Card className="mx-auto w-full max-w-3xl shadow-xl shadow-primary/5">
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileCheck2 className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">{termo.titulo}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{termo.resumo}</p>
              <p className="mt-2 text-xs font-medium text-primary">
                Versão {termo.versao} · vigente desde {formatarData(termo.vigenteEm)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="max-h-[48vh] overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm leading-6 whitespace-pre-wrap sm:p-5"
            tabIndex={0}
            aria-label={`Conteúdo de ${termo.titulo}`}
          >
            {termo.conteudo}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
            <Checkbox
              className="mt-0.5"
              checked={concordou}
              onCheckedChange={(valor) => setConcordou(valor === true)}
            />
            <span className="text-sm leading-5">
              Li e concordo com esta versão dos Termos de Uso.
            </span>
          </label>

          {aceitar.isError && (
            <p role="alert" className="text-sm text-destructive">
              {aceitar.error instanceof ApiError
                ? aceitar.error.message
                : "Não foi possível registrar o aceite. Tente novamente."}
            </p>
          )}

          <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
            <SairButton />
            <Button
              disabled={!concordou || aceitar.isPending}
              onClick={() =>
                aceitar.mutate({ aceite: true, conteudoHash: termo.conteudoHash })
              }
            >
              <ShieldCheck data-icon="inline-start" />
              {aceitar.isPending ? "Registrando…" : "Li e concordo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </GateFrame>
  );
}

function GateFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-muted/30">
      <header className="flex h-16 items-center border-b bg-background px-4 sm:px-6">
        <Image
          src="/logo_bj.png"
          alt="Plataforma Comercial"
          width={130}
          height={44}
          priority
        />
      </header>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">{children}</div>
    </main>
  );
}

function GateLoading() {
  return (
    <GateFrame>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
        Verificando acesso…
      </div>
    </GateFrame>
  );
}

function GateError({ erro, onRetry }: { erro: unknown; onRetry: () => void }) {
  return (
    <GateFrame>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Não foi possível verificar seu acesso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {erro instanceof ApiError
              ? erro.message
              : "Verifique sua conexão e tente novamente."}
          </p>
          <div className="flex justify-between gap-2">
            <SairButton />
            <Button onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    </GateFrame>
  );
}

function SairButton() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  return (
    <Button
      variant="ghost"
      onClick={() => {
        logout();
        router.replace("/login");
      }}
    >
      <LogOut data-icon="inline-start" />
      Sair
    </Button>
  );
}

function formatarData(valor: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(valor));
}
