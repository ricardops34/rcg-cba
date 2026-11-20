"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_ATALHOS_INICIO, type CurrentUser } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { rotaDisponivelNoCelular, useMenu, type MenuItem } from "@/hooks/use-menu";
import { apiFetch, ApiError } from "@/lib/api-client";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Texto e ícone próprios das telas do dia a dia. Tela fora daqui também pode
 * virar atalho (qualquer uma que o menu do usuário mostre): usa o nome e o
 * ícone do menu, com o módulo como descrição.
 */
const CURADOS: Record<string, { titulo: string; descricao: string; icone: LucideIcon }> = {
  "/comercial/posicao-cliente": {
    titulo: "Posição de Cliente",
    descricao: "Carteira, compras, títulos e equipamentos de cada cliente",
    icone: Users,
  },
  "/crm/orcamentos": { titulo: "Orçamentos", descricao: "Propostas em aberto", icone: FileText },
  "/comercial/atendimento": {
    titulo: "Conversas",
    descricao: "Atendimento por WhatsApp",
    icone: MessageCircle,
  },
  "/comercial/meus-atendimentos": {
    titulo: "Meus Atendimentos",
    descricao: "O que você fez nos últimos dias",
    icone: History,
  },
  "/crm/agenda": { titulo: "Agenda", descricao: "Compromissos e visitas", icone: CalendarDays },
  "/crm/atividades": { titulo: "Atividades", descricao: "Tarefas e follow-up", icone: ClipboardList },
  "/comercial/titulos-receber": {
    titulo: "Títulos a Receber",
    descricao: "Cobrança e vencimentos",
    icone: Receipt,
  },
  "/comercial/dashboard": {
    titulo: "Dashboard",
    descricao: "Vendas do período",
    icone: LayoutDashboard,
  },
  "/comercial/produtos": { titulo: "Produtos", descricao: "Catálogo e preços", icone: Package },
  "/gerencial/sugestao-compra": {
    titulo: "Sugestão de Compra",
    descricao: "O que oferecer a cada cliente",
    icone: ShoppingCart,
  },
  "/crm/oportunidades": { titulo: "Oportunidades", descricao: "Funil de vendas", icone: TrendingUp },
  "/gerencial/objetivos": { titulo: "Objetivos", descricao: "Metas por vendedor", icone: Target },
  "/gerencial/dashboard": {
    titulo: "Dashboard Gerencial",
    descricao: "Resultado da equipe",
    icone: LayoutDashboard,
  },
};

/** O principal da tela: primeiro, largo e em evidência. Não sai. */
const ROTA_DESTAQUE = "/comercial/posicao-cliente";
/** Fixo, abre a grade. Não sai. */
const ROTA_FIXA = "/crm/orcamentos";

/**
 * Para quem nunca personalizou: a ordem do trabalho de um vendedor — quem ele
 * atende, o que vende, o que precisa cobrar. Valem os primeiros que ele enxerga.
 */
const PADRAO = [
  "/comercial/atendimento",
  "/comercial/meus-atendimentos",
  "/crm/agenda",
  "/crm/atividades",
  "/comercial/titulos-receber",
  "/comercial/dashboard",
  "/comercial/produtos",
  "/gerencial/sugestao-compra",
  "/crm/oportunidades",
  "/gerencial/objetivos",
  "/gerencial/dashboard",
];

interface AtalhoTela {
  href: string;
  titulo: string;
  descricao: string;
  modulo: string;
  icone?: LucideIcon;
  iconeNome?: string | null;
}

function IconeAtalho({ atalho, className }: { atalho: AtalhoTela; className?: string }) {
  if (atalho.icone) {
    const Icone = atalho.icone;
    return <Icone className={className} />;
  }
  return <DynamicIcon name={atalho.iconeNome} className={className} />;
}

/**
 * Telas que podem virar atalho: as que o menu do usuário mostra (permissão,
 * WhatsApp e, no celular, liberadas para tela pequena — a mesma conta do menu
 * lateral). Por isso o atalho gravado de uma tela que o usuário deixou de
 * enxergar simplesmente some, sem precisar limpar o que está salvo.
 */
function useTelasDisponiveis() {
  const { data: modulos } = useMenu();
  const isMobile = useIsMobile();

  return useMemo(() => {
    if (!modulos) return undefined;
    const telas = new Map<string, AtalhoTela>();
    const incluir = (menu: MenuItem, modulo: string) => {
      if (!menu.rota || menu.rotinas.length === 0 || telas.has(menu.rota)) return;
      if (isMobile && !rotaDisponivelNoCelular(modulos, menu.rota)) return;
      const curado = CURADOS[menu.rota];
      telas.set(menu.rota, {
        href: menu.rota,
        titulo: curado?.titulo ?? menu.nome,
        descricao: curado?.descricao ?? modulo,
        modulo,
        icone: curado?.icone,
        iconeNome: menu.icone,
      });
    };
    for (const modulo of modulos) {
      for (const menu of modulo.menus) {
        incluir(menu, modulo.nome);
        for (const sub of menu.submenus ?? []) incluir(sub, modulo.nome);
      }
    }
    return telas;
  }, [modulos, isMobile]);
}

export function AtalhosInicio() {
  const user = useAuthStore((s) => s.user);
  const telas = useTelasDisponiveis();
  const [editando, setEditando] = useState(false);

  const escolhidas = user?.atalhosInicio ?? null;
  const destaque = telas?.get(ROTA_DESTAQUE);
  const grade = useMemo(() => {
    if (!telas) return [];
    const rotas = escolhidas ?? PADRAO;
    const lista = [ROTA_FIXA, ...rotas]
      .map((rota) => telas.get(rota))
      .filter((t): t is AtalhoTela => !!t && t.href !== ROTA_DESTAQUE);
    return lista.slice(0, MAX_ATALHOS_INICIO + 1);
  }, [telas, escolhidas]);

  // Enquanto o menu carrega não se sabe o que o usuário enxerga: nada aparece,
  // em vez de piscar cartões que depois somem.
  if (!telas || telas.size === 0) return null;

  return (
    <section className="space-y-3" data-tour="acesso-rapido">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Acesso rápido
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setEditando(true)}
        >
          <Pencil className="size-3.5" />
          Personalizar
        </Button>
      </div>

      {destaque && (
        <Link href={destaque.href} className="block">
          <Card className="group bg-primary text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center gap-4 px-4 sm:px-6">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 sm:size-14">
                <IconeAtalho atalho={destaque} className="size-6 sm:size-7" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg leading-snug sm:text-xl">{destaque.titulo}</CardTitle>
                <p className="text-sm opacity-85">{destaque.descricao}</p>
              </div>
              <ArrowRight className="size-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-1" />
            </CardHeader>
          </Card>
        </Link>
      )}

      {grade.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {grade.map((atalho) => (
            <Link key={atalho.href} href={atalho.href} className="min-w-0">
              <Card className="group h-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/30">
                <CardHeader className="px-3 sm:px-4">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-10">
                      <IconeAtalho atalho={atalho} className="size-4.5 sm:size-5" />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <CardTitle className="text-sm leading-snug sm:text-base">{atalho.titulo}</CardTitle>
                  <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                    {atalho.descricao}
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {editando && (
        <PersonalizarAtalhos
          telas={telas}
          inicial={grade.filter((t) => t.href !== ROTA_FIXA).map((t) => t.href)}
          personalizado={escolhidas !== null}
          onFechar={() => setEditando(false)}
        />
      )}
    </section>
  );
}

function PersonalizarAtalhos({
  telas,
  inicial,
  personalizado,
  onFechar,
}: {
  telas: Map<string, AtalhoTela>;
  inicial: string[];
  personalizado: boolean;
  onFechar: () => void;
}) {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<string[]>(inicial);
  const [busca, setBusca] = useState("");

  const salvar = useMutation({
    mutationFn: (atalhos: string[] | null) =>
      apiFetch<CurrentUser>("/auth/me/atalhos-inicio", { method: "PATCH", body: { atalhos } }),
    onSuccess: (atualizado, atalhos) => {
      setUser(atualizado);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success(atalhos === null ? "Atalhos voltaram ao padrão" : "Atalhos salvos");
      onFechar();
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível salvar os atalhos"),
  });

  const cheio = selecionadas.length >= MAX_ATALHOS_INICIO;
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const disponiveis = [...telas.values()].filter(
    (t) =>
      t.href !== ROTA_DESTAQUE &&
      t.href !== ROTA_FIXA &&
      !selecionadas.includes(t.href) &&
      (!termo || `${t.titulo} ${t.modulo}`.toLocaleLowerCase("pt-BR").includes(termo)),
  );
  // Agrupadas por módulo, na ordem do menu.
  const porModulo = new Map<string, AtalhoTela[]>();
  for (const t of disponiveis) porModulo.set(t.modulo, [...(porModulo.get(t.modulo) ?? []), t]);

  const mover = (indice: number, delta: number) =>
    setSelecionadas((atual) => {
      const novo = [...atual];
      const [item] = novo.splice(indice, 1);
      novo.splice(indice + delta, 0, item);
      return novo;
    });

  const fixos = [ROTA_DESTAQUE, ROTA_FIXA]
    .map((rota) => telas.get(rota))
    .filter((t): t is AtalhoTela => !!t);

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personalizar acesso rápido</DialogTitle>
          <DialogDescription>
            Escolha até {MAX_ATALHOS_INICIO} telas, entre as que você acessa. Posição de Cliente e
            Orçamentos ficam sempre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden sm:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Na tela inicial ({selecionadas.length}/{MAX_ATALHOS_INICIO})
            </p>
            <ul className="min-h-0 space-y-1 overflow-y-auto">
              {fixos.map((t) => (
                <li
                  key={t.href}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-sm"
                >
                  <IconeAtalho atalho={t} className="size-4 text-primary" />
                  <span className="flex-1 truncate">{t.titulo}</span>
                  <Lock className="size-3.5 text-muted-foreground" aria-label="Fixo" />
                </li>
              ))}
              {selecionadas.map((rota, i) => {
                const t = telas.get(rota);
                if (!t) return null;
                return (
                  <li key={rota} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                    <IconeAtalho atalho={t} className="size-4 shrink-0 text-primary" />
                    <span className="ml-1 flex-1 truncate">{t.titulo}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === 0}
                      onClick={() => mover(i, -1)}
                      aria-label="Subir"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === selecionadas.length - 1}
                      onClick={() => mover(i, 1)}
                      aria-label="Descer"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setSelecionadas((atual) => atual.filter((r) => r !== rota))}
                      aria-label="Remover"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Adicionar
            </p>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar tela"
                className="pl-8"
              />
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto">
              {[...porModulo.entries()].map(([modulo, lista]) => (
                <div key={modulo} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{modulo}</p>
                  {lista.map((t) => (
                    <button
                      key={t.href}
                      type="button"
                      disabled={cheio}
                      onClick={() => setSelecionadas((atual) => [...atual, t.href])}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        cheio && "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <IconeAtalho atalho={t} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{t.titulo}</span>
                      <Plus className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ))}
              {porModulo.size === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhuma outra tela disponível.
                </p>
              )}
            </div>
            {cheio && (
              <p className="text-xs text-muted-foreground">
                Limite atingido: remova um atalho para adicionar outro.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={!personalizado || salvar.isPending}
            onClick={() => salvar.mutate(null)}
          >
            Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button disabled={salvar.isPending} onClick={() => salvar.mutate(selecionadas)}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
