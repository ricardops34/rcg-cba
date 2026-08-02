"use client";

import type { TabelaPreco } from "@plataforma/contracts";
import { StatusDot } from "@/components/crud/status-dot";
import { Card, CardContent } from "@/components/ui/card";

const dateLabel = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

// Somente leitura: tabelas de preço entram pelo import (e no futuro pela API
// externa de manutenção).
export function TabelaPrecoDetalheContent({ tabelaPreco }: { tabelaPreco: TabelaPreco }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Info label="Código ERP" value={<span className="font-mono">{tabelaPreco.codigoErp}</span>} />
        <Info label="Descrição" value={tabelaPreco.descricao} />
        <Info label="Início da vigência" value={dateLabel(tabelaPreco.dtInicio)} />
        <Info label="Fim da vigência" value={tabelaPreco.dtFim ? dateLabel(tabelaPreco.dtFim) : "sem fim"} />
        <Info label="Status" value={<StatusDot active={tabelaPreco.ativo} />} />
      </CardContent>
    </Card>
  );
}
