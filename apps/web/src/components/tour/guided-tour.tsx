"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourPasso } from "@/lib/tours/inicio-tour";

interface GuidedTourProps {
  passos: TourPasso[];
  passoAtual: number;
  onPasso: (passo: number) => void;
  onConcluir: () => void;
  onPular: () => void;
}

type Retangulo = { top: number; left: number; width: number; height: number };
const MARGEM = 10;

export function GuidedTour({
  passos,
  passoAtual,
  onPasso,
  onConcluir,
  onPular,
}: GuidedTourProps) {
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const passo = passos[passoAtual];

  useEffect(() => {
    const atualizar = () => {
      const elemento = passo.seletor
        ? document.querySelector<HTMLElement>(passo.seletor)
        : null;
      if (!elemento) {
        setAlvo(null);
        return;
      }
      elemento.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const rect = elemento.getBoundingClientRect();
      setAlvo({
        top: Math.max(4, rect.top - MARGEM),
        left: Math.max(4, rect.left - MARGEM),
        width: Math.min(window.innerWidth - 8, rect.width + MARGEM * 2),
        height: Math.min(window.innerHeight - 8, rect.height + MARGEM * 2),
      });
    };
    atualizar();
    const timer = window.setTimeout(atualizar, 250);
    window.addEventListener("resize", atualizar);
    window.addEventListener("scroll", atualizar, true);
    botaoRef.current?.focus();
    return () => {
      window.clearTimeout(timer);
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

  const popoverStyle =
    alvo && window.innerWidth >= 640
      ? {
          left: Math.min(Math.max(16, alvo.left), window.innerWidth - 376),
          top:
            alvo.top + alvo.height + 16 + 280 < window.innerHeight
              ? alvo.top + alvo.height + 16
              : Math.max(16, alvo.top - 296),
        }
      : undefined;

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
        className="fixed right-4 bottom-4 left-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl sm:right-auto sm:bottom-auto sm:w-[360px]"
        style={popoverStyle}
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
