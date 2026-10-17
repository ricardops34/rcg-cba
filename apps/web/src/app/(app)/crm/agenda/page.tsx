"use client";
import { CrudHeader } from "@/components/crud/crud-header";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Atividade, Orcamento } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { useFeriadosAgenda } from "@/hooks/use-feriados-agenda";
import {
  useVendedoresEscopo,
  vendedorFiltroLabel,
} from "@/hooks/use-vendedores-escopo";
import { TIPO_COR } from "@/components/crud/atividade-tipo";
import {
  CATEGORIAS_EVENTO,
  ROTULO_EVENTO_UNITARIO,
  categoriaDoEvento,
  type CategoriaEvento,
} from "@/components/crud/agenda-eventos";
import { Checkbox } from "@/components/ui/checkbox";
import { RoteiroGerarDialog } from "@/components/roteiro/roteiro-gerar-dialog";
import { RoteiroPainel } from "@/components/roteiro/roteiro-painel";
import { Switch } from "@/components/ui/switch";
import {
  STATUS_ORCAMENTO_COR,
  STATUS_ORCAMENTO_LABEL,
} from "@/components/crud/orcamento-status";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useFiltrosUrl } from "@/hooks/use-filtros-url";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertTriangle,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListChecks,
  Plus,
} from "lucide-react";

type Visao = "mes" | "semana" | "dia";
type AgendaItem =
  | { kind: "atividade"; id: string; data: Atividade }
  | { kind: "orcamento"; id: string; data: Orcamento };

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_VISIVEL = 3;

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const estaVencida = (a: Atividade) =>
  !a.concluida &&
  !!a.dataVencimento &&
  new Date(a.dataVencimento).getTime() < Date.now();

/**
 * Orçamento que merece aparecer entre os agendamentos: aberto (rascunho ou
 * enviado), dentro da validade e ainda não faturado. Aprovado/recusado já
 * tiveram desfecho; vencido não há mais o que retomar.
 */
/**
 * O dia do retorno. Retorno antigo é só uma data (meia-noite UTC), e o dia é o
 * do próprio texto; o novo tem hora e vale o dia local de quem olha.
 */
function diaDoRetorno(iso: string) {
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : toKey(new Date(iso));
}

function orcamentoAgendado(o: Orcamento, hojeKey: string) {
  if (o.status !== "rascunho" && o.status !== "enviado") return false;
  if (o.situacaoErp === "faturado" || o.situacaoErp === "faturado_parcial") return false;
  if (o.dataValidade && o.dataValidade.slice(0, 10) < hojeKey) return false;
  return true;
}

export default function AgendaPage() {
  const router = useRouter();
  const parametrosUrl = useSearchParams();
  // Roteiro semanal: gerar (parâmetros e prévia) e o painel de confirmar/remarcar/cancelar.
  const [gerarRoteiro, setGerarRoteiro] = useState(false);
  const [painelRoteiro, setPainelRoteiro] = useState(() => parametrosUrl.get("roteiro") === "confirmar");
  const diaDoRoteiro = parametrosUrl.get("dia");
  // No celular a Agenda é de agendamentos: só o que ainda está por fazer.
  const celular = useIsMobile();
  // Celular abre no dia (o que importa na rua); computador, no mês. A tela só
  // monta depois de a sessão carregar, então já se sabe a largura.
  const [visao, setVisao] = useState<Visao>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
      ? "dia"
      : "mes",
  );
  // O dia em foco: o mês, a semana e o dia mostrados saem dele.
  const [ancora, setAncora] = useState(() => new Date());
  const mesAtual = useMemo(() => startOfMonth(ancora), [ancora]);
  // Filtros que podem vir do link do assistente — ver `useFiltrosUrl`. O
  // cliente é só leitura: quem chegou por "a agenda do cliente X" tira o
  // recorte saindo da tela, não mexendo num controle.
  const urlFiltros = useFiltrosUrl();
  const [clienteId] = useState(() => urlFiltros.texto("clienteId"));
  const [vendedorId, setVendedorId] = useState<string | undefined>(() =>
    urlFiltros.texto("vendedorId"),
  );
  // Natureza dos eventos que aparecem; começa com todas.
  const [categorias, setCategorias] = useState<CategoriaEvento[]>(() =>
    CATEGORIAS_EVENTO.map((c) => c.value),
  );
  // Computador: orçamento vencido ou faturado entra ou não. No celular nunca.
  const [incluirEncerrados, setIncluirEncerrados] = useState(true);
  // Só o que o vendedor marcou como importante (bandeira vermelha).
  const [somenteImportantes, setSomenteImportantes] = useState(false);
  const todasAsCategorias = categorias.length === CATEGORIAS_EVENTO.length;
  const alternarCategoria = (c: CategoriaEvento, ligada: boolean) =>
    setCategorias((atual) => (ligada ? [...atual, c] : atual.filter((x) => x !== c)));
  const [somentePendentes, setSomentePendentes] = useState(false);
  // No celular o mês é um mapa de pontos e o detalhe é o dia escolhido.
  const diaSelecionado = ancora;
  const setDiaSelecionado = setAncora;

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const feriadosQuery = useFeriadosAgenda();
  const feriadosPorDia = new Map((feriadosQuery.data ?? []).map((f) => [f.data.slice(0, 10), f.descricao]));
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(
    vendedoresEscopoQuery.data?.ehVendedorPuro ?? false
  );

  const gridStart = useMemo(
    () => addDays(startOfMonth(mesAtual), -startOfMonth(mesAtual).getDay()),
    [mesAtual],
  );
  const gridEnd = useMemo(() => {
    const fim = endOfMonth(mesAtual);
    return addDays(fim, 6 - fim.getDay());
  }, [mesAtual]);
  const dias = useMemo(() => {
    const total =
      Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
    return Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  }, [gridStart, gridEnd]);

  const atividadesQuery = useResourceList<Atividade>("atividades", {
    dataInicio: toKey(gridStart),
    dataFim: toKey(gridEnd),
    pageSize: 100,
    sortBy: "dataVencimento",
    sortOrder: "asc",
    ...(vendedorId ? { vendedorId } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(somentePendentes || celular ? { concluida: false } : {}),
    ...(somenteImportantes ? { importante: true } : {}),
  });

  // Orçamentos entram na Agenda pela data de criação — registro do que foi
  // feito naquele dia, ao lado dos agendamentos/atividades.
  // No celular entra só o orçamento com retorno agendado, pelo dia do retorno
  // (e a tela descarta depois o vencido e o faturado).
  const orcamentosQuery = useResourceList<Orcamento>("orcamentos", {
    ...(celular
      ? { retornoInicio: toKey(gridStart), retornoFim: toKey(gridEnd) }
      : { dataInicio: toKey(gridStart), dataFim: toKey(gridEnd) }),
    pageSize: 100,
    sortBy: "createdAt",
    sortOrder: "asc",
    ...(vendedorId ? { vendedorId } : {}),
  });

  const isLoading = atividadesQuery.isLoading || orcamentosQuery.isLoading;

  const porDia = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    const add = (key: string, item: AgendaItem) => {
      const lista = mapa.get(key) ?? [];
      lista.push(item);
      mapa.set(key, lista);
    };
    for (const a of atividadesQuery.data?.data ?? []) {
      if (!a.dataVencimento) continue;
      const item: AgendaItem = { kind: "atividade", id: a.id, data: a };
      if (!categorias.includes(categoriaDoEvento(item))) continue;
      add(toKey(new Date(a.dataVencimento)), item);
    }
    const hojeKey = toKey(new Date());
    for (const o of orcamentosQuery.data?.data ?? []) {
      const item: AgendaItem = { kind: "orcamento", id: o.id, data: o };
      if (!categorias.includes("orcamento") || somenteImportantes) continue;
      // Vencido e faturado só entram se o filtro deixar (no celular, nunca).
      if (!incluirEncerrados && !orcamentoAgendado(o, hojeKey)) continue;
      add(toKey(new Date(o.createdAt)), item);
    }
    return mapa;
  }, [
    atividadesQuery.data,
    orcamentosQuery.data,
    categorias,
    incluirEncerrados,
    somenteImportantes,
  ]);

  // O que o celular mostra: **agendamentos**. Atividade ainda por fazer e
  // orçamento com retorno marcado que segue de pé. Concluída, orçamento vencido
  // ou faturado e orçamento sem retorno ficam de fora. Montado aqui, e não só
  // na consulta, porque os blocos do celular e do computador são desenhados
  // juntos e escondidos por CSS — o que vale é o que cada um recebe.
  const porDiaCelular = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    const add = (dia: string, item: AgendaItem) =>
      mapa.set(dia, [...(mapa.get(dia) ?? []), item]);

    const pendentes = (atividadesQuery.data?.data ?? []).filter(
      (a) => !a.concluida && !!a.dataVencimento,
    );
    for (const a of pendentes) {
      const item: AgendaItem = { kind: "atividade", id: a.id, data: a };
      if (!categorias.includes(categoriaDoEvento(item))) continue;
      add(toKey(new Date(a.dataVencimento!)), item);
    }

    if (celular && categorias.includes("orcamento") && !somenteImportantes) {
      const hojeKey = toKey(new Date());
      // O retorno do orçamento já gera uma atividade de ligação: se ela está
      // na lista, é ela que representa o retorno — mostrar os dois seria
      // duplicar a mesma providência.
      const comAtividade = new Set(
        pendentes.map((a) => a.orcamentoId).filter((id): id is string => !!id),
      );
      for (const o of orcamentosQuery.data?.data ?? []) {
        if (!o.dataRetorno || comAtividade.has(o.id)) continue;
        if (!orcamentoAgendado(o, hojeKey)) continue;
        add(diaDoRetorno(o.dataRetorno), { kind: "orcamento", id: o.id, data: o });
      }
    }
    return mapa;
  }, [atividadesQuery.data, orcamentosQuery.data, celular, categorias, somenteImportantes]);

  const hoje = new Date();
  // A semana vai de domingo a sábado, como a grade do mês. No celular a
  // semana mostra só de segunda a sexta (sábado e domingo ficam de fora).
  const inicioSemana = addDays(ancora, -ancora.getDay());
  const diasSemana = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i));
  const diasUteis = diasSemana.filter((d) => d.getDay() >= 1 && d.getDay() <= 5);
  const itensFimDeSemana = diasSemana
    .filter((d) => d.getDay() === 0 || d.getDay() === 6)
    .reduce((n, d) => n + (porDiaCelular.get(toKey(d))?.length ?? 0), 0);

  const mover = (sentido: 1 | -1) =>
    setAncora((a) =>
      visao === "mes"
        ? new Date(a.getFullYear(), a.getMonth() + sentido, 1)
        : addDays(a, (visao === "semana" ? 7 : 1) * sentido),
    );
  const rotuloAnterior = { mes: "Mês anterior", semana: "Semana anterior", dia: "Dia anterior" }[visao];
  const rotuloProximo = { mes: "Próximo mês", semana: "Próxima semana", dia: "Próximo dia" }[visao];

  const intervalo = (a: Date, b: Date) =>
    a.getMonth() === b.getMonth()
      ? `${a.getDate()} a ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
      : `${a.getDate()} de ${MESES[a.getMonth()].slice(0, 3)} a ${b.getDate()} de ${MESES[b.getMonth()].slice(0, 3)} de ${b.getFullYear()}`;

  const filtrosAtivos =
    !todasAsCategorias || !incluirEncerrados || !!vendedorId || somenteImportantes;
  const limparFiltros = () => {
    setCategorias(CATEGORIAS_EVENTO.map((c) => c.value));
    setIncluirEncerrados(true);
    setSomenteImportantes(false);
    setVendedorId(undefined);
  };

  const onSelectItem = (item: AgendaItem) => {
    if (item.kind === "atividade") router.push(`/crm/atividades/${item.id}`);
    else router.push(`/crm/orcamentos/${item.id}`);
  };

  return (
    <div data-tour="rotina" className="space-y-4">
      {feriadosQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar os feriados. Atualize a agenda para tentar novamente.</p>}
      <CrudHeader
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setGerarRoteiro(true)}>
              <CalendarPlus className="size-4" />
              <span className="hidden sm:inline">Gerar roteiro</span>
            </Button>
            <Button variant="outline" onClick={() => setPainelRoteiro(true)}>
              <ListChecks className="size-4" />
              <span className="hidden sm:inline">Meu roteiro</span>
            </Button>
          <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Eventos da agenda</FieldLabel>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setCategorias(todasAsCategorias ? [] : CATEGORIAS_EVENTO.map((c) => c.value))
                  }
                >
                  {todasAsCategorias ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </div>
              <div className="space-y-1.5">
                {CATEGORIAS_EVENTO.map((c) => (
                  <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={categorias.includes(c.value)}
                      onCheckedChange={(v) => alternarCategoria(c.value, v === true)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5">
                <Flag className="size-3.5 fill-red-500 text-red-500" />
                Só os importantes
              </span>
              <Switch checked={somenteImportantes} onCheckedChange={setSomenteImportantes} />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
              <span>
                Orçamentos vencidos e faturados
                <span className="block text-xs text-muted-foreground">
                  No celular nunca aparecem.
                </span>
              </span>
              <Switch
                checked={incluirEncerrados}
                disabled={!categorias.includes("orcamento")}
                onCheckedChange={setIncluirEncerrados}
              />
            </label>

            {mostrarFiltroVendedor && (
              <div className="space-y-2">
                <FieldLabel>Vendedor</FieldLabel>
                <Select
                  value={vendedorId ?? "none"}
                  onValueChange={(v) =>
                    setVendedorId(v === "none" ? undefined : v)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Qualquer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Qualquer</SelectItem>
                    {opcoesVendedor.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {vendedorFiltroLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </FiltersPopover>
          </div>
        }
        onRefresh={() => {
          void atividadesQuery.refetch();
          void feriadosQuery.refetch();
          void orcamentosQuery.refetch();
        }}
        isRefreshing={atividadesQuery.isFetching || orcamentosQuery.isFetching}
        onCreate={() => router.push("/crm/atividades/novo")}
        createLabel="Nova atividade"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold capitalize tracking-tight">
          {visao === "mes" ? (
            <>
              {MESES[mesAtual.getMonth()]} de {mesAtual.getFullYear()}
            </>
          ) : visao === "semana" ? (
            <>
              <span className="md:hidden">{intervalo(diasUteis[0], diasUteis[diasUteis.length - 1])}</span>
              <span className="hidden md:inline">{intervalo(diasSemana[0], diasSemana[6])}</span>
            </>
          ) : (
            ancora.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)}>
            <TabsList aria-label="Visão da agenda">
              <TabsTrigger value="mes">Mês</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="dia">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon"
            aria-label={rotuloAnterior}
            onClick={() => mover(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setAncora(new Date())}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={rotuloProximo}
            onClick={() => mover(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground md:hidden">
        Aqui aparecem só os agendamentos pendentes e os orçamentos com retorno marcado; o que já foi feito não é mostrado.
      </p>
      <div className="hidden flex-wrap items-center justify-between gap-2 md:flex">
        <QuickFilterGroup>
          <QuickFilterButton
            active={somentePendentes}
            onClick={() => setSomentePendentes((v) => !v)}
          >
            <AlertTriangle className="size-3.5" />
            Somente pendentes
          </QuickFilterButton>
        </QuickFilterGroup>
      </div>

      {visao === "dia" ? (
        <>
          <div className="md:hidden">
            <DiaDetalhe
              dia={ancora}
              feriado={feriadosPorDia.get(toKey(ancora))}
              itens={porDiaCelular.get(toKey(ancora)) ?? []}
              isLoading={isLoading}
              onSelectItem={onSelectItem}
              onNovo={() => router.push(`/crm/atividades/novo?data=${toKey(ancora)}`)}
            />
          </div>
          <div className="mx-auto hidden w-full max-w-2xl md:block">
            <DiaDetalhe
              dia={ancora}
              feriado={feriadosPorDia.get(toKey(ancora))}
              itens={porDia.get(toKey(ancora)) ?? []}
              isLoading={isLoading}
              onSelectItem={onSelectItem}
              onNovo={() => router.push(`/crm/atividades/novo?data=${toKey(ancora)}`)}
            />
          </div>
        </>
      ) : null}

      {visao === "semana" ? (
        <>
          {/* Computador e tablet: os sete dias lado a lado, com todos os itens. */}
          <div
            data-tour="agenda-calendario"
            className="hidden overflow-x-auto rounded-lg border md:block"
          >
            <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden bg-border">
              {diasSemana.map((d) => (
                <div
                  key={`cab-${toKey(d)}`}
                  className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                >
                  {DIAS_SEMANA[d.getDay()]}
                </div>
              ))}
              {diasSemana.map((dia) => (
                <DayCell
                  key={toKey(dia)}
                  dia={dia}
                  feriado={feriadosPorDia.get(toKey(dia))}
                  noMes
                  hoje={isSameDay(dia, hoje)}
                  itens={porDia.get(toKey(dia)) ?? []}
                  isLoading={isLoading}
                  limite={Infinity}
                  alto
                  onSelectDia={() => router.push(`/crm/atividades/novo?data=${toKey(dia)}`)}
                  onSelectItem={onSelectItem}
                />
              ))}
            </div>
          </div>

          {/* Celular: segunda a sexta, um bloco por dia. Sábado e domingo ficam
              de fora de propósito; se houver algo neles, a linha abaixo avisa. */}
          <div className="space-y-5 md:hidden">
            {diasUteis.map((dia) => (
              <DiaDetalhe
                key={toKey(dia)}
                dia={dia}
                feriado={feriadosPorDia.get(toKey(dia))}
                itens={porDiaCelular.get(toKey(dia)) ?? []}
                isLoading={isLoading}
                onSelectItem={onSelectItem}
                onNovo={() => router.push(`/crm/atividades/novo?data=${toKey(dia)}`)}
              />
            ))}
            {itensFimDeSemana > 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                Há {itensFimDeSemana} {itensFimDeSemana === 1 ? "item" : "itens"} no fim de
                semana, que não aparece aqui. Veja pela visão Dia ou Mês.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {visao === "mes" ? (
        <>
      {/* Celular: o mês vira um mapa de pontos e o detalhe é o dia escolhido,
          em lista — a grade de 7 colunas legíveis não cabe em 390 px. */}
      <div className="space-y-3 md:hidden">
        <MesCompacto
          dias={dias}
          mesAtual={mesAtual}
          hoje={hoje}
          selecionado={diaSelecionado}
          feriadosPorDia={feriadosPorDia}
          porDia={porDiaCelular}
          isLoading={isLoading}
          onSelecionar={setDiaSelecionado}
        />
        <DiaDetalhe
          dia={diaSelecionado}
          feriado={feriadosPorDia.get(toKey(diaSelecionado))}
          itens={porDiaCelular.get(toKey(diaSelecionado)) ?? []}
          isLoading={isLoading}
          onSelectItem={onSelectItem}
          onNovo={() =>
            router.push(`/crm/atividades/novo?data=${toKey(diaSelecionado)}`)
          }
        />
      </div>

      <div
        data-tour="agenda-calendario"
        className="hidden overflow-x-auto rounded-lg border md:block"
      >
        <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden bg-border">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {dias.map((dia) => (
            <DayCell
              key={toKey(dia)}
              dia={dia}
              feriado={feriadosPorDia.get(toKey(dia))}
              noMes={dia.getMonth() === mesAtual.getMonth()}
              hoje={isSameDay(dia, hoje)}
              itens={porDia.get(toKey(dia)) ?? []}
              isLoading={isLoading}
              onSelectDia={() =>
                router.push(`/crm/atividades/novo?data=${toKey(dia)}`)
              }
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      </div>
        </>
      ) : null}

      <RoteiroGerarDialog aberto={gerarRoteiro} onOpenChange={setGerarRoteiro} />
      <RoteiroPainel
        aberto={painelRoteiro}
        onOpenChange={setPainelRoteiro}
        diaEmFoco={diaDoRoteiro}
      />
    </div>
  );
}

/** A hora marcada da atividade; vazio quando é de dia inteiro (00:00). */
function horaDoItem(item: AgendaItem): string | null {
  if (item.kind !== "atividade" || !item.data.dataVencimento) return null;
  const d = new Date(item.data.dataVencimento);
  if (Number.isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0)) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const corDoItem = (item: AgendaItem) =>
  item.kind === "atividade" ? TIPO_COR[item.data.tipo] : STATUS_ORCAMENTO_COR[item.data.status];

/** Mês em miniatura para o celular: número do dia e até 3 pontos coloridos. */
function MesCompacto({
  dias,
  mesAtual,
  hoje,
  selecionado,
  feriadosPorDia,
  porDia,
  isLoading,
  onSelecionar,
}: {
  dias: Date[];
  mesAtual: Date;
  hoje: Date;
  selecionado: Date;
  feriadosPorDia: Map<string, string>;
  porDia: Map<string, AgendaItem[]>;
  isLoading: boolean;
  onSelecionar: (d: Date) => void;
}) {
  return (
    <div data-tour="agenda-calendario" className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 gap-px bg-border">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="bg-muted py-1 text-center text-[11px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {dias.map((dia) => {
          const chave = toKey(dia);
          const itens = porDia.get(chave) ?? [];
          const ehHoje = isSameDay(dia, hoje);
          const ehSelecionado = isSameDay(dia, selecionado);
          const feriado = feriadosPorDia.has(chave);
          return (
            <button
              key={chave}
              type="button"
              onClick={() => onSelecionar(dia)}
              aria-pressed={ehSelecionado}
              aria-label={`${dia.getDate()} de ${MESES[dia.getMonth()]}, ${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
              className={`flex h-12 flex-col items-center justify-start gap-0.5 bg-background pt-1 text-xs transition-colors ${
                dia.getMonth() === mesAtual.getMonth() ? "" : "text-muted-foreground/50"
              } ${feriado ? "bg-amber-50 dark:bg-amber-950/40" : ""} ${
                ehSelecionado ? "ring-2 ring-inset ring-primary" : ""
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full tabular-nums ${
                  ehHoje ? "bg-primary font-medium text-primary-foreground" : ""
                }`}
              >
                {dia.getDate()}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {!isLoading &&
                  itens.slice(0, 3).map((item) => (
                    <span
                      key={`${item.kind}-${item.id}`}
                      className={`size-1.5 rounded-full ${corDoItem(item)} ${
                        item.kind === "atividade" && item.data.importante
                          ? "ring-2 ring-red-500"
                          : ""
                      }`}
                    />
                  ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** O dia escolhido no celular, item por item, com área de toque confortável. */
function DiaDetalhe({
  dia,
  feriado,
  itens,
  isLoading,
  onSelectItem,
  onNovo,
}: {
  dia: Date;
  feriado?: string;
  itens: AgendaItem[];
  isLoading: boolean;
  onSelectItem: (item: AgendaItem) => void;
  onNovo: () => void;
}) {
  // Com hora primeiro, em ordem; o resto (dia inteiro, orçamentos) depois.
  const ordenados = [...itens].sort((a, b) => {
    // Importantes no alto do dia.
    const ia = a.kind === "atividade" && a.data.importante ? 1 : 0;
    const ib = b.kind === "atividade" && b.data.importante ? 1 : 0;
    if (ia !== ib) return ib - ia;
    const ha = horaDoItem(a);
    const hb = horaDoItem(b);
    if (ha && hb) return ha.localeCompare(hb);
    if (ha) return -1;
    if (hb) return 1;
    return 0;
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold capitalize">
          {dia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <Button size="sm" variant="outline" onClick={onNovo}>
          <Plus className="size-4" />
          Neste dia
        </Button>
      </div>
      {feriado ? (
        <p className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {feriado}
        </p>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : ordenados.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nada marcado para este dia.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {ordenados.map((item) => {
            const hora = horaDoItem(item);
            const vencida = item.kind === "atividade" && estaVencida(item.data);
            const concluida = item.kind === "atividade" && item.data.concluida;
            const importante = item.kind === "atividade" && !!item.data.importante;
            const detalhe =
              item.kind === "atividade"
                ? [ROTULO_EVENTO_UNITARIO[categoriaDoEvento(item)], item.data.cliente?.razaoSocial]
                    .filter(Boolean)
                    .join(" · ")
                : `Retorno do orçamento · ${STATUS_ORCAMENTO_LABEL[item.data.status]}`;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                    importante ? "border-l-4 border-l-red-500 bg-red-50/70 dark:bg-red-950/20" : ""
                  }`}
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${corDoItem(item)}`} />
                  <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {hora ?? "Dia"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block break-words text-sm ${
                        concluida
                          ? "text-muted-foreground line-through"
                          : vencida
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {item.data.titulo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {detalhe}
                    </span>
                  </span>
                  {importante ? (
                    <Flag className="size-4 shrink-0 fill-red-500 text-red-500" aria-label="Importante" />
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DayCell({
  dia,
  feriado,
  noMes,
  hoje,
  itens,
  isLoading,
  limite = MAX_VISIVEL,
  alto = false,
  onSelectDia,
  onSelectItem,
}: {
  dia: Date;
  feriado?: string;
  noMes: boolean;
  hoje: boolean;
  itens: AgendaItem[];
  isLoading: boolean;
  /** Quantos itens mostrar antes do "+N mais"; a semana mostra todos. */
  limite?: number;
  /** Célula mais alta, para a visão de semana. */
  alto?: boolean;
  onSelectDia: () => void;
  onSelectItem: (item: AgendaItem) => void;
}) {
  const visiveis = itens.slice(0, limite);
  const resto = itens.length - visiveis.length;

  return (
    <div
      className={`flex ${alto ? "min-h-72" : "min-h-28"} flex-col gap-1 bg-background p-1.5 transition-colors hover:bg-muted/40 ${
        noMes ? "text-muted-foreground" : ""
      }`}
      onClick={onSelectDia}
      role="button"
    >
      <span
        className={`self-start text-xs ${
          hoje
            ? "flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
            : "px-1"
        }`}
      >
        {dia.getDate()}
      </span>
      {feriado && <span className="rounded bg-amber-100 px-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200" title={feriado}>{feriado}</span>}

      {isLoading ? (
        <Skeleton className="h-4 w-full" />
      ) : (
        <div className="flex flex-col gap-1">
          {visiveis.map((item) => (
            <AgendaItemChip
              key={`${item.kind}-${item.id}`}
              item={item}
              onSelect={() => onSelectItem(item)}
            />
          ))}
          {resto > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(ev) => ev.stopPropagation()}
                  className="self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  +{resto} mais
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 space-y-1 p-2"
                onClick={(ev) => ev.stopPropagation()}
              >
                {itens.map((item) => (
                  <AgendaItemChip
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onSelect={() => onSelectItem(item)}
                  />
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaItemChip({
  item,
  onSelect,
}: {
  item: AgendaItem;
  onSelect: () => void;
}) {
  const vencida = item.kind === "atividade" && estaVencida(item.data);
  const concluida = item.kind === "atividade" && item.data.concluida;
  const titulo =
    item.kind === "atividade" ? item.data.titulo : item.data.titulo;
  const cor =
    item.kind === "atividade"
      ? TIPO_COR[item.data.tipo]
      : STATUS_ORCAMENTO_COR[item.data.status];
  // Hora só quando informada (atividade de dia inteiro fica em 00:00) — ajuda
  // a ordenar visualmente o dia sem poluir quem não marcou horário.
  const hora = (() => {
    if (item.kind !== "atividade" || !item.data.dataVencimento) return null;
    const d = new Date(item.data.dataVencimento);
    if (
      Number.isNaN(d.getTime()) ||
      (d.getHours() === 0 && d.getMinutes() === 0)
    )
      return null;
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect();
      }}
      title={titulo}
      className={`flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted ${
        concluida
          ? "text-muted-foreground line-through"
          : vencida
            ? "text-destructive"
            : ""
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${cor}`} />
      {item.kind === "atividade" && item.data.importante ? (
        <Flag className="size-3 shrink-0 fill-red-500 text-red-500" aria-label="Importante" />
      ) : null}
      {hora && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {hora}
        </span>
      )}
      <span className="truncate">{titulo}</span>
    </button>
  );
}
