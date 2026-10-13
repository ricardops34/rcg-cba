"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface PaginacaoProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Opções do "n / página". */
  tamanhos?: number[];
  className?: string;
}

/**
 * Rodapé de paginação: "1–10 de 87", tamanho da página e as setas com o campo
 * "Página [n]". O da EntityTable e o das listas que paginam no navegador.
 */
export function Paginacao({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  tamanhos = [10, 20, 50],
  className,
}: PaginacaoProps) {
  return (
    <div className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger size="sm" className="w-[7.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tamanhos.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          title="Primeira página"
          aria-label="Primeira página"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Página anterior"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Página
          {/* key: volta a mostrar a página atual quando ela muda por fora (setas, filtro). */}
          <IrParaPagina key={page} page={page} totalPages={Math.max(totalPages, 1)} onPageChange={onPageChange} />
          de {Math.max(totalPages, 1)}
        </div>
        <Button
          variant="outline"
          size="icon"
          title="Próxima página"
          aria-label="Próxima página"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Última página"
          aria-label="Última página"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}


/** Campo "Página [n]": aplica no Enter ou ao sair; valor inválido volta ao atual. */
function IrParaPagina({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const [valor, setValor] = useState(String(page));

  function aplicar() {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) return setValor(String(page));
    const destino = Math.min(n, totalPages);
    if (destino !== page) onPageChange(destino);
    else setValor(String(page));
  }

  return (
    <Input
      inputMode="numeric"
      aria-label="Ir para a página"
      className="h-8 w-14 text-center"
      value={valor}
      disabled={totalPages <= 1}
      onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === "Enter") aplicar();
        if (e.key === "Escape") setValor(String(page));
      }}
    />
  );
}
