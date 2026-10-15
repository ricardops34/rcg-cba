"use client";

import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterMultiSelect } from "@/components/crud/filter-multi-select";

/** Hoje e o primeiro dia do ano, em AAAA-MM-DD (data local). */
export function hojeIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export const inicioDoAnoIso = () => `${hojeIso().slice(0, 4)}-01-01`;

/** `2026-01-07` → `07/01/2026`. */
export const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function CampoData({
  id,
  rotulo,
  valor,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} type="date" className="w-40" value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function CampoTexto({
  id,
  rotulo,
  valor,
  onChange,
  placeholder,
  largura = "w-48",
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  largura?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        className={largura}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Filtros preenchidos, em texto, para o cabeçalho do PDF e do Excel. */
export function descreverFiltros(
  periodo: { inicio: string; fim: string; rotulo?: string },
  filtros: [string, string | undefined][],
): string[] {
  const linhas = [`${periodo.rotulo ?? "Período"}: ${dataBr(periodo.inicio)} a ${dataBr(periodo.fim)}`];
  const preenchidos = filtros.filter(([, v]) => v && v.trim());
  if (preenchidos.length) linhas.push(preenchidos.map(([r, v]) => `${r}: ${v}`).join(" · "));
  return linhas;
}

/** Só os filtros preenchidos, para a query da API. */
export function semVazios(obj: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && String(v).trim() !== ""),
  ) as Record<string, string | number>;
}

/**
 * Categorias do filtro dos relatórios: as principais marcadas como **Usada**
 * no cadastro — é o que a empresa chama de categoria ativa (decisão do
 * usuário, 14/10/2026; o `ativo` vem do ERP e está ligado em todas). Só a
 * lista do filtro: sem categoria escolhida, o relatório traz tudo.
 */
export function useCategoriasRelatorio() {
  return useQuery({
    queryKey: ["categorias", "select", "raizes", "usadas", "relatorios"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: true, ativo: true, usado: true },
      }),
    staleTime: 5 * 60_000,
  });
}

/** Descrição de cada categoria, para os chips e o cabeçalho do PDF e do Excel. */
export function useNomeCategoria() {
  const { data } = useCategoriasRelatorio();
  return (id: string) => data?.data.find((c) => c.id === id)?.descricao ?? id;
}

/** Categorias com seleção múltipla; vazio = todas. */
export function CampoCategorias({
  valor,
  onChange,
}: {
  valor: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useCategoriasRelatorio();
  return (
    <div className="min-w-0 space-y-1">
      <Label>Categoria</Label>
      <FilterMultiSelect
        value={valor}
        onChange={onChange}
        placeholder="Todas"
        searchPlaceholder="Buscar categoria..."
        options={(data?.data ?? []).map((c) => ({ value: c.id, label: c.descricao }))}
      />
    </div>
  );
}
