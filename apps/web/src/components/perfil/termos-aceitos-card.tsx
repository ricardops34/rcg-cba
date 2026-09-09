"use client";

import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import type { TermosStatus } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TermosAceitosCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["termos", "status"],
    queryFn: () => apiFetch<TermosStatus>("/termos/status"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-primary" />
          Termos aceitos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : !data?.aceites.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhum aceite registrado para esta conta.
          </p>
        ) : (
          <ul className="divide-y">
            {data.aceites.map((aceite) => (
              <li key={aceite.termoId} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{aceite.titulo}</p>
                  <p className="text-xs text-muted-foreground">Versão {aceite.versao}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={aceite.aceitoEm}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(aceite.aceitoEm))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

