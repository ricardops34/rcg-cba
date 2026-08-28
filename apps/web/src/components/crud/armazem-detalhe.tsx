"use client";

import type { Armazem } from "@plataforma/contracts";
import { StatusDot } from "@/components/crud/status-dot";
import { Card, CardContent } from "@/components/ui/card";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

// Somente leitura: armazéns entram pelo import (e no futuro pela API
// externa de manutenção).
export function ArmazemDetalheContent({ armazem }: { armazem: Armazem }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Código ERP" value={<span className="font-mono">{armazem.codigoErp}</span>} />
        <Info label="Descrição" value={armazem.descricao} />
        <Info label="Status" value={<StatusDot active={armazem.ativo} />} />
      </CardContent>
    </Card>
  );
}
