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

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%` : "—";

// Somente leitura: condições de pagamento entram pelo import (e no futuro
// pela API externa de manutenção).
export function CondicaoPagamentoDetalheContent({ condicao }: { condicao: CondicaoPagamento }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Código ERP" value={<span className="font-mono">{condicao.codigoErp}</span>} />
        <Info label="Integração" value={<span className="font-mono">{condicao.chave || "—"}</span>} />
        <Info label="Descrição" value={condicao.descricao} />
        <Info label="Forma" value={condicao.forma} />
        {/* Direto do ERP (SE4), decisão de 2026-11-19. */}
        <Info label="Acréscimo financeiro" value={percentual(condicao.acrescimoFinanceiro)} />
        <Info label="Valor mínimo" value={moeda(condicao.valorMinimo)} />
        <Info label="Usar no orçamento" value={condicao.usadoOrcamento ? "Sim" : "Não"} />
        <Info label="Status" value={<StatusDot active={condicao.ativo} />} />
      </CardContent>
    </Card>
  );
}
