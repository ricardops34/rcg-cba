"use client";

import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
 * Categorias principais ativas, para o filtro dos relatórios. Sem o corte de
 * "usada nas análises": compra de serviço e de consumo também é compra.
 */
export function useCategoriasRelatorio() {
  return useQuery({
    queryKey: ["categorias", "select", "raizes", "relatorios"],
    queryFn: () =>
      apiFetch<{ data: Categoria[] }>("/categorias", {
        query: { pageSize: 100, raiz: true, ativo: true },
      }),
    staleTime: 5 * 60_000,
  });
}

/** Descrição da categoria escolhida, para o cabeçalho do PDF e do Excel. */
export function useDescricaoCategoria(id: string | undefined) {
  const { data } = useCategoriasRelatorio();
  return id ? data?.data.find((c) => c.id === id)?.descricao ?? id : undefined;
}

export function CampoCategoria({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (id: string) => void;
}) {
  const { data } = useCategoriasRelatorio();
  return (
    <div className="space-y-1">
      <Label>Categoria</Label>
      <Select value={valor || "todas"} onValueChange={(v) => onChange(v === "todas" ? "" : v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Todas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas</SelectItem>
          {(data?.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.descricao}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
