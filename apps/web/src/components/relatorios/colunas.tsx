"use client";

import { useState } from "react";
import { Columns3 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

/**
 * Colunas escolhidas de um relatório. Diferente do seletor do EntityTable,
 * a escolha vale também para o PDF e o Excel — por isso mora aqui, fora da
 * tabela. Guardada no navegador, por usuário (como o do EntityTable).
 */
export function useColunasEscolhidas<T>(chave: string, colunas: ColunaRelatorio<T>[]) {
  const usuarioId = useAuthStore((s) => s.user?.id);
  const storageKey = usuarioId ? `plataforma-relatorio-colunas-${chave}-${usuarioId}` : null;

  const [ocultas, setOcultas] = useState<string[]>(() => {
    if (!storageKey || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const gravar = (proximas: string[]) => {
    setOcultas(proximas);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(proximas));
    } catch {
      // Sem armazenamento (aba privada): a escolha vale só até recarregar.
    }
  };

  const visiveis = colunas.filter((c) => !ocultas.includes(c.campo));
  const alternar = (campo: string) => {
    if (ocultas.includes(campo)) gravar(ocultas.filter((c) => c !== campo));
    // A última coluna visível não sai — relatório sem coluna não serve.
    else if (visiveis.length > 1) gravar([...ocultas, campo]);
  };

  return { visiveis, ocultas, alternar, mostrarTodas: () => gravar([]) };
}

export function SeletorColunas<T>({
  colunas,
  ocultas,
  alternar,
  mostrarTodas,
}: {
  colunas: ColunaRelatorio<T>[];
  ocultas: string[];
  alternar: (campo: string) => void;
  mostrarTodas: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Columns3 className="size-4" />
          Colunas
          {ocultas.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {colunas.length - ocultas.length}/{colunas.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Colunas na tela, no PDF e no Excel</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {colunas.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.campo}
            checked={!ocultas.includes(c.campo)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => alternar(c.campo)}
          >
            {c.titulo}
          </DropdownMenuCheckboxItem>
        ))}
        {ocultas.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={mostrarTodas}>Mostrar todas</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Linha de totais para o PDF e o Excel, alinhada às colunas visíveis: o
 * valor de `totais[campo]` nas numéricas e "Total" na primeira coluna que não
 * tiver total.
 */
export function linhaDeTotais<T>(
  colunas: ColunaRelatorio<T>[],
  totais: Record<string, number>,
): (string | number | null)[] {
  let rotulo = false;
  return colunas.map((c) => {
    if (c.campo in totais) return totais[c.campo];
    if (!rotulo) {
      rotulo = true;
      return "Total";
    }
    return null;
  });
}
