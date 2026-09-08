"use client";

import { useMemo, useState } from "react";
import { MAX_MESES_CONSULTA, MESES_LABEL } from "@plataforma/contracts";
import {
  PADRAO_EMPRESA,
  TODOS,
  anosDisponiveis,
  erroDoPeriodo,
  mesesDoPeriodo,
  periodoPadrao,
} from "@/components/consultas/periodo-consulta";
import { useFiltrosUrl } from "@/hooks/use-filtros-url";
import { VendedoresMultiSelect } from "@/components/crud/vendedores-multi-select";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";

/**
 * A cortina de parâmetros das Consultas de venda e o estado que ela edita.
 *
 * Vive aqui, e não em cada tela, porque período, vendedor e "vendedor
 * considerado" são os mesmos em todas — e precisam continuar sendo: a regra de
 * período é validada de novo no servidor, e a base do vendedor muda o
 * significado de todo número da tabela. Cada consulta acrescenta os seus
 * filtros próprios pela lista `filtrosExtras`.
 */

/** Item do resumo de parâmetros mostrado acima da tabela. */
export function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Zero em coluna de mês vira "—": a tabela é quase toda numérica e o olho
 *  precisa achar onde houve venda. */
export const celula = (v: number) => (v === 0 ? "—" : moeda(v));

/** Um select específico de uma consulta (categoria, subcategoria...). */
export interface FiltroExtra {
  /** Nome do parâmetro na API, ex.: "categoriaId". */
  chave: string;
  label: string;
  /** Rótulo da opção "sem filtro", ex.: "Todas". */
  rotuloTodos: string;
  opcoes: { id: string; descricao: string }[];
  /** Texto de apoio abaixo do select. */
  ajuda?: string;
  desabilitado?: boolean;
  /**
   * Chaves de outros filtros extras a zerar quando este mudar. É o que impede
   * uma subcategoria de continuar escolhida depois de trocada a categoria — o
   * par ficaria impossível, e a consulta voltaria vazia sem explicação.
   */
  limpaAoMudar?: string[];
}

/** Estado dos filtros da consulta — o que a cortina edita e o botão aplica. */
export interface Filtros {
  anoInicial: string;
  mesInicial: string;
  anoFinal: string;
  mesFinal: string;
  /** Vazio = todos os vendedores do escopo. */
  vendedorIds: string[];
  baseVendedor: string;
  /** Valor de cada filtro extra, por chave. Ausente ou TODOS = sem filtro. */
  extras: Record<string, string>;
}

/** O valor de um filtro extra, com o padrão "todos" para quem nunca escolheu. */
export const valorExtra = (filtros: Filtros, chave: string) =>
  filtros.extras[chave] ?? TODOS;

/**
 * Filtros e cortina de uma consulta.
 *
 * `filtros` é o que está valendo na consulta; `rascunho` é o que a cortina
 * está editando. Sem essa separação, cada clique dentro da cortina dispara uma
 * consulta de ano inteiro no banco.
 *
 * `chavesExtras` são os parâmetros próprios da tela: servem para o valor
 * inicial poder vir da URL, como o período.
 */
export function useFiltrosConsulta(chavesExtras: string[] = []) {
  // O período pode vir pronto na URL — é assim que o botão do assistente abre
  // a consulta no mesmo intervalo de que ele acabou de falar, em vez de no
  // padrão. Ver `useFiltrosUrl`; valor ausente ou inválido cai no padrão.
  const urlFiltros = useFiltrosUrl();
  const filtrosIniciais: Filtros = useMemo(() => {
    const padrao = periodoPadrao();
    const mes = (chave: string, atual: string) => {
      const v = urlFiltros.numero(chave);
      return v && v >= 1 && v <= 12 ? String(v) : atual;
    };
    const ano = (chave: string, atual: string) => {
      const v = urlFiltros.numero(chave);
      return v && v >= 2000 && v <= 2100 ? String(v) : atual;
    };
    return {
      anoInicial: ano("anoInicial", padrao.anoInicial),
      mesInicial: mes("mesInicial", padrao.mesInicial),
      anoFinal: ano("anoFinal", padrao.anoFinal),
      mesFinal: mes("mesFinal", padrao.mesFinal),
      vendedorIds: [],
      baseVendedor: PADRAO_EMPRESA,
      extras: Object.fromEntries(
        chavesExtras.map((chave) => [chave, urlFiltros.texto(chave) ?? TODOS]),
      ),
    };
    // Só a primeira montagem conta: daí em diante quem manda é a cortina de
    // filtros, não a URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [rascunho, setRascunho] = useState<Filtros>(filtrosIniciais);
  const [cortinaAberta, setCortinaAberta] = useState(false);

  const abrirCortina = (aberta: boolean) => {
    // Reabrir a cortina depois de fechar sem aplicar precisa mostrar o que
    // está valendo, não o rascunho abandonado.
    if (aberta) setRascunho(filtros);
    setCortinaAberta(aberta);
  };

  const erroPeriodo = erroDoPeriodo(rascunho);

  const aplicarFiltros = () => {
    if (erroPeriodo) return;
    setFiltros(rascunho);
    setCortinaAberta(false);
  };

  /** Quantos filtros além do período estão valendo — o número no botão. */
  const quantidadeFiltros = [
    filtros.vendedorIds.length > 0,
    filtros.baseVendedor !== PADRAO_EMPRESA,
    ...chavesExtras.map((chave) => valorExtra(filtros, chave) !== TODOS),
  ].filter(Boolean).length;

  /** A parte da querystring comum a todas as consultas. */
  const queryPadrao = {
    anoInicial: filtros.anoInicial,
    mesInicial: filtros.mesInicial,
    anoFinal: filtros.anoFinal,
    mesFinal: filtros.mesFinal,
    // CSV: o apiFetch serializa só escalares, e a API aceita as duas formas.
    vendedorIds:
      filtros.vendedorIds.length > 0 ? filtros.vendedorIds.join(",") : undefined,
    baseVendedor:
      filtros.baseVendedor === PADRAO_EMPRESA ? undefined : filtros.baseVendedor,
    ...Object.fromEntries(
      chavesExtras
        .filter((chave) => valorExtra(filtros, chave) !== TODOS)
        .map((chave) => [chave, filtros.extras[chave]]),
    ),
  };

  return {
    filtros,
    filtrosIniciais,
    rascunho,
    setRascunho,
    cortinaAberta,
    abrirCortina,
    aplicarFiltros,
    erroPeriodo,
    quantidadeFiltros,
    queryPadrao,
  };
}

export type FiltrosConsulta = ReturnType<typeof useFiltrosConsulta>;

/** Um par mês+ano da cortina — as duas pontas do período são idênticas. */
function PontaDoPeriodo({
  titulo,
  mes,
  ano,
  anos,
  onChange,
  children,
}: {
  titulo: string;
  mes: string;
  ano: string;
  anos: number[];
  onChange: (campos: { mes?: string; ano?: string }) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <div className="flex gap-2">
        <Select value={mes} onValueChange={(v) => onChange({ mes: v })}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES_LABEL.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ano} onValueChange={(v) => onChange({ ano: v })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {children}
    </div>
  );
}

/**
 * A cortina lateral com os parâmetros. Recebe o estado do
 * `useFiltrosConsulta` da tela e os filtros próprios dela.
 */
export function CortinaParametros({
  estado,
  filtrosExtras = [],
}: {
  estado: FiltrosConsulta;
  filtrosExtras?: FiltroExtra[];
}) {
  const anos = useMemo(() => anosDisponiveis(), []);
  const {
    rascunho,
    setRascunho,
    cortinaAberta,
    abrirCortina,
    aplicarFiltros,
    erroPeriodo,
    filtrosIniciais,
  } = estado;
  const mesesDoRascunho = mesesDoPeriodo(rascunho);

  const escolherExtra = (filtro: FiltroExtra, valor: string) =>
    setRascunho((r) => ({
      ...r,
      extras: {
        ...r.extras,
        [filtro.chave]: valor,
        ...Object.fromEntries(
          (filtro.limpaAoMudar ?? []).map((chave) => [chave, TODOS]),
        ),
      },
    }));

  return (
    <Sheet open={cortinaAberta} onOpenChange={abrirCortina}>
      <ResizableSheetContent defaultWidth={420}>
        <SheetHeader>
          <SheetTitle>Parâmetros da consulta</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <PontaDoPeriodo
            titulo="Período inicial"
            mes={rascunho.mesInicial}
            ano={rascunho.anoInicial}
            anos={anos}
            onChange={({ mes, ano }) =>
              setRascunho((r) => ({
                ...r,
                ...(mes ? { mesInicial: mes } : {}),
                ...(ano ? { anoInicial: ano } : {}),
              }))
            }
          />

          <PontaDoPeriodo
            titulo="Período final"
            mes={rascunho.mesFinal}
            ano={rascunho.anoFinal}
            anos={anos}
            onChange={({ mes, ano }) =>
              setRascunho((r) => ({
                ...r,
                ...(mes ? { mesFinal: mes } : {}),
                ...(ano ? { anoFinal: ano } : {}),
              }))
            }
          >
            {erroPeriodo ? (
              <p className="text-xs text-destructive">{erroPeriodo}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {mesesDoRascunho} {mesesDoRascunho === 1 ? "mês" : "meses"} no
                período (máximo {MAX_MESES_CONSULTA}).
              </p>
            )}
          </PontaDoPeriodo>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Vendedor</p>
            <VendedoresMultiSelect
              value={rascunho.vendedorIds}
              onChange={(ids) => setRascunho((r) => ({ ...r, vendedorIds: ids }))}
            />
            {rascunho.vendedorIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {rascunho.vendedorIds.length}{" "}
                {rascunho.vendedorIds.length === 1 ? "selecionado" : "selecionados"}{" "}
                — sem nenhum, a consulta traz todos do seu escopo.
              </p>
            )}
          </div>

          {filtrosExtras.map((filtro) => (
            <div key={filtro.chave} className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{filtro.label}</p>
              <Select
                value={valorExtra(rascunho, filtro.chave)}
                onValueChange={(v) => escolherExtra(filtro, v)}
                disabled={filtro.desabilitado}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={filtro.rotuloTodos} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{filtro.rotuloTodos}</SelectItem>
                  {filtro.opcoes.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtro.ajuda && (
                <p className="text-xs text-muted-foreground">{filtro.ajuda}</p>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Vendedor considerado</p>
            <Select
              value={rascunho.baseVendedor}
              onValueChange={(v) => setRascunho((r) => ({ ...r, baseVendedor: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PADRAO_EMPRESA}>Padrão da empresa</SelectItem>
                <SelectItem value="nota">Vendedor da nota</SelectItem>
                <SelectItem value="cliente">
                  Vendedor do cadastro do cliente
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Quem leva o crédito da venda: quem emitiu a nota, ou o titular da
              carteira do cliente. O padrão vem do parâmetro
              CONSULTA_VENDAS_BASE_VENDEDOR (Administração &gt; Parâmetros) e pode
              ser trocado só nesta consulta.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={aplicarFiltros} disabled={!!erroPeriodo}>
              Aplicar
            </Button>
            <Button variant="ghost" onClick={() => setRascunho(filtrosIniciais)}>
              Limpar
            </Button>
          </div>
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
