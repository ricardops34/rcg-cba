"use client";

import type { CondicaoPagamento } from "@plataforma/contracts";
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

// Somente leitura: condições de pagamento entram pelo import (e no futuro
// pela API externa de manutenção).
export function CondicaoPagamentoDetalheContent({ condicao }: { condicao: CondicaoPagamento }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Código ERP" value={<span className="font-mono">{condicao.codigoErp}</span>} />
        <Info label="Descrição" value={condicao.descricao} />
        <Info label="Forma" value={condicao.forma} />
        <Info label="Status" value={<StatusDot active={condicao.ativo} />} />
      </CardContent>
    </Card>
  );
}
