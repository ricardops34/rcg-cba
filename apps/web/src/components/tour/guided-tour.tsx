"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourPasso } from "@/lib/tours/tour-tipos";

interface GuidedTourProps {
  passos: TourPasso[];
  passoAtual: number;
  onPasso: (passo: number) => void;
  onConcluir: () => void;
  onPular: () => void;
}

type Retangulo = { top: number; left: number; width: number; height: number };
type Posicao = { top: number; left: number };

const MARGEM = 10;
const ESPACO = 16;
const BORDA_TELA = 16;
const PAINEL_PADRAO = { width: 320, height: 280 };

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo));
}

function areaSobreposta(a: Retangulo, b: Retangulo) {
  const largura = Math.max(
    0,
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
  );
  const altura = Math.max(
    0,
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
  );
  return largura * altura;
}

function posicionarPainel(
  alvo: Retangulo | null,
  painel: { width: number; height: number },
): Posicao {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const maxLeft = viewport.width - painel.width - BORDA_TELA;
  const maxTop = viewport.height - painel.height - BORDA_TELA;

  if (!alvo) {
    return {
      left: limitar((viewport.width - painel.width) / 2, BORDA_TELA, maxLeft),
      top: limitar((viewport.height - painel.height) / 2, BORDA_TELA, maxTop),
    };
  }

  const alinharHorizontal = limitar(alvo.left, BORDA_TELA, maxLeft);
  const alinharVertical = limitar(alvo.top, BORDA_TELA, maxTop);
  const opcoes = [
    {
      espaco: viewport.width - BORDA_TELA - (alvo.left + alvo.width) - ESPACO,
      necessario: painel.width,
      posicao: {
        left: alvo.left + alvo.width + ESPACO,
        top: alinharVertical,
      },
    },
    {
      espaco: alvo.left - BORDA_TELA - ESPACO,
      necessario: painel.width,
      posicao: {
        left: alvo.left - ESPACO - painel.width,
        top: alinharVertical,
      },
    },
    {
      espaco: viewport.height - BORDA_TELA - (alvo.top + alvo.height) - ESPACO,
      necessario: painel.height,
      posicao: {
        left: alinharHorizontal,
        top: alvo.top + alvo.height + ESPACO,
      },
    },
    {
      espaco: alvo.top - BORDA_TELA - ESPACO,
      necessario: painel.height,
      posicao: {
        left: alinharHorizontal,
        top: alvo.top - ESPACO - painel.height,
      },
    },
  ]
    .filter((opcao) => opcao.espaco >= opcao.necessario)
    .sort((a, b) => b.espaco - b.necessario - (a.espaco - a.necessario));

  if (opcoes[0]) return opcoes[0].posicao;

  // Em janelas muito pequenas, escolhe o canto que encobre a menor parte do
  // alvo. Os passos invisíveis já são removidos pelo TourProvider.
  const cantos = [
    { left: BORDA_TELA, top: BORDA_TELA },
    { left: maxLeft, top: BORDA_TELA },
    { left: BORDA_TELA, top: maxTop },
    { left: maxLeft, top: maxTop },
  ];
  return cantos.sort((a, b) => {
    const painelA = { ...a, ...painel };
    const painelB = { ...b, ...painel };
    return areaSobreposta(painelA, alvo) - areaSobreposta(painelB, alvo);
  })[0];
}

export function GuidedTour({
  passos,
  passoAtual,
  onPasso,
  onConcluir,
  onPular,
}: GuidedTourProps) {
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  const passo = passos[passoAtual];

  useEffect(() => {
    const elemento = passo.seletor
      ? document.querySelector<HTMLElement>(passo.seletor)
      : null;
    elemento?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    let animationFrame = 0;
    const atualizar = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const rect = elemento?.getBoundingClientRect();
        const destaque = rect
          ? {
              top: Math.max(4, rect.top - MARGEM),
              left: Math.max(4, rect.left - MARGEM),
              width: Math.max(
                0,
                Math.min(window.innerWidth - 4, rect.right + MARGEM) -
                  Math.max(4, rect.left - MARGEM),
              ),
              height: Math.max(
                0,
                Math.min(window.innerHeight - 4, rect.bottom + MARGEM) -
                  Math.max(4, rect.top - MARGEM),
              ),
            }
          : null;
        const painel = painelRef.current
          ? {
              width: painelRef.current.offsetWidth,
              height: painelRef.current.offsetHeight,
            }
          : PAINEL_PADRAO;
        setAlvo(destaque);
        setPosicao(posicionarPainel(destaque, painel));
      });
    };

    atualizar();
    const timer = window.setTimeout(atualizar, 250);
    const observer = new ResizeObserver(atualizar);
    if (elemento) observer.observe(elemento);
    if (painelRef.current) observer.observe(painelRef.current);
    window.addEventListener("resize", atualizar);
    window.addEventListener("scroll", atualizar, {
      capture: true,
      passive: true,
    });
    botaoRef.current?.focus();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", atualizar);
      window.removeEventListener("scroll", atualizar, true);
    };
  }, [passo]);

  useEffect(() => {
    const tecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") onPular();
      if (event.key === "ArrowRight") {
        passoAtual === passos.length - 1
          ? onConcluir()
          : onPasso(passoAtual + 1);
      }
      if (event.key === "ArrowLeft" && passoAtual > 0) {
        onPasso(passoAtual - 1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onConcluir, onPasso, onPular, passoAtual, passos.length]);

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={passo.titulo}
    >
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {alvo && (
              <rect
                x={alvo.left}
                y={alvo.top}
                width={alvo.width}
                height={alvo.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgb(2 6 23 / 0.76)"
          mask="url(#tour-spotlight)"
        />
      </svg>

      {alvo && (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent"
          style={alvo}
          aria-hidden="true"
        />
      )}

      <section
        ref={painelRef}
        className="fixed max-h-[calc(100vh-32px)] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl"
        style={
          posicao ?? {
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }
        }
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wider text-primary uppercase">
              Passo {passoAtual + 1} de {passos.length}
            </p>
            <h2 className="text-lg font-semibold leading-tight">
              {passo.titulo}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPular}
            aria-label="Fechar tour"
            className="-mt-2 -mr-2 shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {passo.descricao}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onPular}>
            Pular tour
          </Button>
          <div className="flex gap-2">
            {passoAtual > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPasso(passoAtual - 1)}
              >
                <ChevronLeft className="size-4" /> Voltar
              </Button>
            )}
            <Button
              ref={botaoRef}
              size="sm"
              onClick={() =>
                passoAtual === passos.length - 1
                  ? onConcluir()
                  : onPasso(passoAtual + 1)
              }
            >
              {passoAtual === passos.length - 1 ? "Concluir" : "Próximo"}
              {passoAtual < passos.length - 1 && (
                <ChevronRight className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
