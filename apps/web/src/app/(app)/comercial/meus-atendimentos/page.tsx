"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircle,
  Receipt,
  UserRound,
} from "lucide-react";
import type {
  AtendimentoItem,
  CategoriaAtendimento,
  EscopoAtendimento,
  MeusAtendimentos,
} from "@plataforma/contracts";
import { CATEGORIA_ATENDIMENTO_ROTULO } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useFiltrosUrl } from "@/hooks/use-filtros-url";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Meus Atendimentos: o que este vendedor fez, em linha do tempo.
 *
 * É o histórico de atendimento do cliente visto pelo outro lado — em vez de
 * "tudo que aconteceu com o cliente X", "tudo que eu fiz". A fonte é a rotina
 * de Atividades, onde WhatsApp, 2ª via, orçamento e agenda já gravam.
 *
 * **Feed, não relatório.** Rola do mais recente para trás e vai carregando
 * sozinho conforme desce — sem paginador e sem obrigar a escolher período,
 * como uma linha do tempo de rede social. Os atalhos de período continuam ali
 * para quem quer só o de hoje; sem nenhum deles, o feed vai até o começo.
 *
 * **Não inclui nem edita nada.** O que aparece aqui é gravado pelas rotinas
 * que fazem o atendimento; um botão de novo registro aqui criaria um histórico
 * digitado à mão ao lado do que de fato aconteceu.
 */

/** Os atalhos de período. `null` = o feed inteiro, que é o padrão. */
const PERIODOS: { dias: number | null; rotulo: string }[] = [
  { dias: null, rotulo: "Tudo" },
  { dias: 1, rotulo: "Hoje" },
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
];

const ICONE: Record<CategoriaAtendimento, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  documento: Receipt,
  orcamento: FileText,
  agenda: CalendarClock,
};

/** Uma cor por frente do atendimento — a mesma no ícone e no contador. */
const COR: Record<CategoriaAtendimento, string> = {
  whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  documento: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  orcamento: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  agenda: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

const horaBr = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * "agora", "há 20 min", "há 3 h" — e a hora do relógio a partir de ontem.
 *
 * O relativo só vale enquanto o dia é o de hoje: "há 32 h" faz o leitor
 * calcular, enquanto "14:20" de ontem ele lê direto (o cabeçalho do grupo já
 * diz qual é o dia).
 */
function quandoRelativo(iso: string) {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (new Date(iso) >= hoje) return `há ${horas} h`;
  return horaBr(iso);
}

/** "Hoje"/"Ontem" antes da data: é assim que quem trabalhou no dia pensa. */
function tituloDoDia(iso: string) {
  const dia = new Date(iso);
  dia.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diferenca = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";
  if (diferenca === -1) return "Amanhã";
  return dia.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(dia.getFullYear() !== hoje.getFullYear() ? { year: "numeric" } : {}),
  });
}

export default function MeusAtendimentosPage() {
  const filtros = useFiltrosUrl();
  // Estado inicial vindo da URL — é o que faz o botão do assistente abrir a
  // tela já no recorte que ele respondeu (ver `useFiltrosUrl`).
  const [dias, setDias] = useState<number | null>(() => {
    const daUrl = filtros.numero("dias");
    return daUrl && daUrl >= 1 && daUrl <= 365 ? daUrl : null;
  });
  const [clienteId, setClienteId] = useState<string | null>(
    () => filtros.texto("clienteId") ?? null,
  );
  const [escopo, setEscopo] = useState<EscopoAtendimento>(() =>
    filtros.texto("escopo") === "equipe" ? "equipe" : "proprio",
  );

  const consulta = useInfiniteQuery({
    queryKey: ["meus-atendimentos", dias, clienteId, escopo],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<MeusAtendimentos>("/meus-atendimentos", {
        query: {
          escopo,
          ...(dias ? { dias } : {}),
          ...(clienteId ? { clienteId } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  });

  // O topo (contadores, seletor de equipe) vem da primeira página: são do
  // período inteiro, não do que já foi rolado.
  const cabecalho = consulta.data?.pages[0];
  const itens = useMemo(
    () => consulta.data?.pages.flatMap((p) => p.itens) ?? [],
    [consulta.data],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus Atendimentos
        </h1>
        <p className="text-muted-foreground">
          Tudo o que você fez — conversas, documentos, orçamentos e agenda.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {PERIODOS.map((p) => (
            <Button
              key={p.rotulo}
              type="button"
              size="sm"
              variant={dias === p.dias ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setDias(p.dias)}
            >
              {p.rotulo}
            </Button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <ClienteCombobox
            value={clienteId}
            onChange={setClienteId}
            placeholder="Todos os clientes"
          />
        </div>
        {/* Só quem tem subordinados escolhe de quem é a linha do tempo — para
            o vendedor o seletor seria um botão que não muda nada. */}
        {cabecalho?.podeVerEquipe && (
          <div className="flex rounded-md border p-0.5">
            {(["proprio", "equipe"] as const).map((valor) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                variant={escopo === valor ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setEscopo(valor)}
              >
                {valor === "proprio" ? "Meus" : "Minha equipe"}
              </Button>
            ))}
          </div>
        )}
        {clienteId && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setClienteId(null)}
          >
            Limpar cliente
          </Button>
        )}
      </div>

      <Totais resumo={cabecalho} carregando={consulta.isLoading} />

      <Feed
        itens={itens}
        carregando={consulta.isLoading}
        mostrarVendedor={cabecalho?.escopo === "equipe"}
        temMais={consulta.hasNextPage}
        carregandoMais={consulta.isFetchingNextPage}
        carregarMais={() => void consulta.fetchNextPage()}
      />
    </div>
  );
}

function Totais({
  resumo,
  carregando,
}: {
  resumo?: MeusAtendimentos;
  carregando: boolean;
}) {
  if (carregando) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (!resumo) return null;

  const cartoes: { rotulo: string; valor: number; classe?: string }[] = [
    { rotulo: "Registros", valor: resumo.totais.registros },
    { rotulo: "Clientes", valor: resumo.totais.clientes },
    ...(["whatsapp", "documento", "orcamento", "agenda"] as const).map((c) => ({
      rotulo: CATEGORIA_ATENDIMENTO_ROTULO[c],
      valor: resumo.totais[c],
      classe: COR[c],
    })),
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cartoes.map((c) => (
        <Card key={c.rotulo}>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{c.valor}</p>
            <p
              className={cn(
                "mt-1 inline-block rounded px-1.5 py-0.5 text-xs",
                c.classe ?? "text-muted-foreground",
              )}
            >
              {c.rotulo}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Feed({
  itens,
  carregando,
  mostrarVendedor,
  temMais,
  carregandoMais,
  carregarMais,
}: {
  itens: AtendimentoItem[];
  carregando: boolean;
  mostrarVendedor?: boolean;
  temMais: boolean;
  carregandoMais: boolean;
  carregarMais: () => void;
}) {
  const sentinela = useRef<HTMLDivElement | null>(null);

  /**
   * Carrega a próxima página quando o fim do feed se aproxima.
   *
   * `rootMargin` generoso de propósito: dispara antes de o rodapé aparecer, e
   * quem rola rápido não vê a lista parar. O observador é recriado a cada
   * mudança porque `carregarMais` muda de identidade entre renders.
   */
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || !temMais || carregandoMais) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) carregarMais();
      },
      { rootMargin: "600px" },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [temMais, carregandoMais, carregarMais, itens.length]);

  if (carregando) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!itens.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nada registrado no período. O que você fizer — conversar no WhatsApp,
          mandar um boleto, montar um orçamento — aparece aqui.
        </CardContent>
      </Card>
    );
  }

  // Agrupa por dia mantendo a ordem que veio do servidor (mais recente
  // primeiro). O agrupamento é feito sobre a lista acumulada, e não por
  // página, senão o mesmo dia ganharia dois cabeçalhos ao carregar mais.
  const dias: { chave: string; itens: AtendimentoItem[] }[] = [];
  for (const item of itens) {
    const chave = item.quando.slice(0, 10);
    const ultimo = dias[dias.length - 1];
    if (ultimo?.chave === chave) ultimo.itens.push(item);
    else dias.push({ chave, itens: [item] });
  }

  return (
    <div className="space-y-6">
      {dias.map((dia) => (
        <section key={dia.chave} className="space-y-2">
          {/* O cabeçalho do dia acompanha a rolagem: em feed longo, saber em
              que dia se está é o que evita rolar de volta para conferir. */}
          <h2 className="bg-background/85 sticky top-0 z-10 py-1 text-sm font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
            {tituloDoDia(dia.itens[0].quando)}
          </h2>
          <div className="space-y-2">
            {dia.itens.map((item) => (
              <Publicacao
                key={item.id}
                item={item}
                mostrarVendedor={mostrarVendedor}
              />
            ))}
          </div>
        </section>
      ))}

      <div ref={sentinela} className="pb-2">
        {carregandoMais && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {!temMais && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Você chegou ao começo do seu histórico.
          </p>
        )}
      </div>
    </div>
  );
}

/** Um acontecimento do feed — o cliente é quem "assina", como num post. */
function Publicacao({
  item,
  mostrarVendedor,
}: {
  item: AtendimentoItem;
  mostrarVendedor?: boolean;
}) {
  const Icone = ICONE[item.categoria];
  const nome = item.clienteNome ?? "Sem cliente";

  return (
    <article className="flex gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:bg-accent/30">
      <div className="relative shrink-0">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full text-sm font-medium",
            item.clienteNome
              ? avatarColorClass(nome)
              : "bg-muted text-muted-foreground",
          )}
        >
          {item.clienteNome ? initials(nome) : <UserRound className="size-4" />}
        </span>
        {/* A frente do atendimento vira o selo do avatar — a mesma cor do
            contador lá em cima, para o olho ligar as duas coisas. */}
        <span
          className={cn(
            "absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2 ring-card",
            COR[item.categoria],
          )}
        >
          <Icone className="size-3" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{nome}</span>
          {mostrarVendedor && item.vendedorNome && (
            <span className="text-xs text-muted-foreground">
              · {item.vendedorNome}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {quandoRelativo(item.quando)}
          </span>
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {item.titulo}
          {item.concluida ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
          ) : (
            <Badge variant="outline" className="h-5 gap-1 text-[11px]">
              <Clock className="size-3" />
              Pendente
            </Badge>
          )}
        </p>

        {item.descricao && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.descricao}
          </p>
        )}
      </div>
    </article>
  );
}
