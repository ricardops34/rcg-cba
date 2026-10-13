"use client";

import { Fragment, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { PaginacaoProps } from "@/components/crud/paginacao";

/**
 * Ano, agrupamento e paginação das listas da Posição de Cliente. A posição
 * chega inteira numa requisição (cliente grande passa de mil notas), então
 * tudo aqui é feito no navegador, sobre a lista já filtrada e ordenada.
 */

export const TODOS_OS_ANOS = "todos";

/** Ano da data civil — a data vem como ISO em UTC, igual à que a tela mostra. */
export const anoDe = (v: string | null | undefined) => (v ? v.slice(0, 4) : null);

export function anosDisponiveis<T>(lista: T[], data: (t: T) => string | null | undefined) {
  const anos = new Set<string>();
  for (const item of lista) {
    const ano = anoDe(data(item));
    if (ano) anos.add(ano);
  }
  return [...anos].sort().reverse();
}

export function filtrarPorAno<T>(
  lista: T[],
  data: (t: T) => string | null | undefined,
  ano: string,
) {
  return ano === TODOS_OS_ANOS ? lista : lista.filter((t) => anoDe(data(t)) === ano);
}

/**
 * Reagrupa a lista já ordenada por ano, mantendo a ordem escolhida dentro de
 * cada ano (o sort do JS é estável). Ano mais recente primeiro, menos quando
 * a ordenação é pela própria data em ordem crescente. Sem data vai ao fim.
 */
export function agruparPorAno<T>(
  lista: T[],
  data: (t: T) => string | null | undefined,
  crescente = false,
) {
  return [...lista].sort((a, b) => {
    const anoA = anoDe(data(a));
    const anoB = anoDe(data(b));
    if (anoA === anoB) return 0;
    if (anoA == null) return 1;
    if (anoB == null) return -1;
    return crescente ? anoA.localeCompare(anoB) : anoB.localeCompare(anoA);
  });
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Rótulo de cada ano ("2026 · 120 notas · R$ 1.234,00"), contado sobre a lista
 * inteira filtrada — não só a página —, para o total do ano não mudar
 * conforme a página.
 */
export function resumoPorAno<T>(
  lista: T[],
  data: (t: T) => string | null | undefined,
  nome: { singular: string; plural: string },
  valor?: (t: T) => number | null | undefined,
) {
  const grupos = new Map<string | null, { qtd: number; total: number }>();
  for (const item of lista) {
    const ano = anoDe(data(item));
    const grupo = grupos.get(ano) ?? { qtd: 0, total: 0 };
    grupo.qtd += 1;
    grupo.total += valor?.(item) ?? 0;
    grupos.set(ano, grupo);
  }
  const rotulos = new Map<string | null, string>();
  for (const [ano, { qtd, total }] of grupos) {
    const partes = [ano ?? "Sem data", `${qtd.toLocaleString("pt-BR")} ${qtd === 1 ? nome.singular : nome.plural}`];
    if (valor) partes.push(moeda(total));
    rotulos.set(ano, partes.join(" · "));
  }
  return rotulos;
}

export function FiltroAno({
  anos,
  valor,
  onChange,
}: {
  anos: string[];
  valor: string;
  onChange: (ano: string) => void;
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="w-36" aria-label="Ano">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS_OS_ANOS}>Todos os anos</SelectItem>
        {anos.map((ano) => (
          <SelectItem key={ano} value={ano}>
            {ano}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Corpo da tabela com uma linha de título a cada troca de ano. Na virada de
 * página o ano se repete no topo, para a página não começar sem dizer de que
 * ano é.
 */
export function CorpoPorAno<T>({
  itens,
  data,
  colunas,
  resumo,
  chave,
  children,
}: {
  itens: T[];
  data: (t: T) => string | null | undefined;
  colunas: number;
  resumo: Map<string | null, string>;
  chave: (t: T) => string;
  children: (t: T) => React.ReactNode;
}) {
  return (
    <TableBody>
      {itens.map((item, i) => {
        const ano = anoDe(data(item));
        const novoAno = i === 0 || anoDe(data(itens[i - 1])) !== ano;
        return (
          <Fragment key={chave(item)}>
            {novoAno && (
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={colunas} className="py-1.5 text-xs font-semibold text-muted-foreground">
                  {resumo.get(ano) ?? ano ?? "Sem data"}
                </TableCell>
              </TableRow>
            )}
            {children(item)}
          </Fragment>
        );
      })}
    </TableBody>
  );
}

export const TAMANHOS_PAGINA_POSICAO = [25, 50, 100];

/**
 * Paginação local. Volta à primeira página quando a lista muda (outro filtro,
 * busca ou ordem) — ajuste de estado no render, sem efeito.
 */
export function usePaginaLocal<T>(lista: T[], tamanhoInicial = 50) {
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(tamanhoInicial);
  const [listaAnterior, setListaAnterior] = useState(lista);
  if (listaAnterior !== lista) {
    setListaAnterior(lista);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const atual = Math.min(pagina, totalPaginas);
  const itens = useMemo(
    () => lista.slice((atual - 1) * tamanho, atual * tamanho),
    [lista, atual, tamanho],
  );

  const paginacao: PaginacaoProps = {
    page: atual,
    pageSize: tamanho,
    total: lista.length,
    totalPages: totalPaginas,
    onPageChange: setPagina,
    onPageSizeChange: (n) => {
      setTamanho(n);
      setPagina(1);
    },
    tamanhos: TAMANHOS_PAGINA_POSICAO,
  };
  return { itens, paginacao };
}
