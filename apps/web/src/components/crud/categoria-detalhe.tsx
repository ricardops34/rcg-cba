"use client";

import type { Categoria } from "@plataforma/contracts";
import { StatusDot } from "@/components/crud/status-dot";
import { Card, CardContent } from "@/components/ui/card";
import { regraDescontoLabel } from "@/lib/regra-desconto";

export type CategoriaDetalhe = Categoria & {
  categoriaPai?: { id: string; codigoErp: string; descricao: string } | null;
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

// Somente leitura: categorias entram pelo import (e no futuro pela API
// externa de manutenção).
export function CategoriaDetalheContent({ categoria }: { categoria: CategoriaDetalhe }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Código ERP" value={<span className="font-mono">{categoria.codigoErp}</span>} />
        <Info label="Descrição" value={categoria.descricao} />
        <Info
          label="Nível"
          value={categoria.categoriaPaiId ? "Subcategoria" : "Categoria raiz"}
        />
        <Info label="Categoria pai" value={categoria.categoriaPai?.descricao} />
        <Info label="Regra de desconto" value={regraDescontoLabel(categoria.regraDesconto)} />
        <Info label="Usada nas análises" value={categoria.usado == null ? "—" : categoria.usado ? "Sim" : "Não"} />
        <Info label="Status" value={<StatusDot active={categoria.ativo} />} />
      </CardContent>
    </Card>
  );
}
