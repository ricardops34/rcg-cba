"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import type {
  TourEstado,
  TourExecucao,
  TourOrigem,
  TourStatus,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import {
  INICIO_TOUR_CODIGO,
  INICIO_TOUR_PASSOS,
  INICIO_TOUR_VERSAO,
  type TourPasso,
} from "@/lib/tours/inicio-tour";
import { GuidedTour } from "./guided-tour";

interface TourContextValue {
  iniciarTourInicio: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [execucao, setExecucao] = useState<TourExecucao | null>(null);
  const [passoAtual, setPassoAtual] = useState(0);
  const [passos, setPassos] = useState<TourPasso[]>(INICIO_TOUR_PASSOS);
  const consultado = useRef(false);

  const iniciar = useCallback(async (origem: TourOrigem) => {
    const nova = await apiFetch<TourExecucao>(
      `/tours/${INICIO_TOUR_CODIGO}/execucoes`,
      { method: "POST", body: { versao: INICIO_TOUR_VERSAO, origem } },
    );
    const visiveis = INICIO_TOUR_PASSOS.filter((passo) => {
      if (!passo.seletor) return true;
      const elemento = document.querySelector<HTMLElement>(passo.seletor);
      if (!elemento) return false;
      const rect = elemento.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    setPassos(visiveis);
    setPassoAtual(0);
    setExecucao(nova);
  }, []);

  useEffect(() => {
    if (pathname !== "/" || consultado.current) return;
    consultado.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const estado = await apiFetch<TourEstado>(
          `/tours/${INICIO_TOUR_CODIGO}/estado`,
          { query: { versao: INICIO_TOUR_VERSAO } },
        );
        if (estado.deveIniciarAutomaticamente) await iniciar("automatico");
      } catch {
        // A indisponibilidade do recurso de apresentação nunca deve impedir
        // o uso normal da plataforma.
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [iniciar, pathname]);

  const salvar = useCallback(
    async (passo: number, status: TourStatus) => {
      const atual = execucao;
      if (!atual) return;
      setPassoAtual(passo);
      if (status !== "em_andamento") setExecucao(null);
      try {
        await apiFetch(`/tours/execucoes/${atual.id}`, {
          method: "PATCH",
          body: { passoAtual: passo, status },
        });
      } catch {
        // A navegação do tour continua responsiva mesmo se o salvamento
        // momentâneo falhar; um replay manual permanece disponível.
      }
    },
    [execucao],
  );

  const iniciarTourInicio = useCallback(() => {
    if (pathname !== "/") return;
    void iniciar("manual").catch(() => {
      toast.error("Não foi possível iniciar o tour. Tente novamente.");
    });
  }, [iniciar, pathname]);

  return (
    <TourContext.Provider value={{ iniciarTourInicio }}>
      {children}
      {execucao && (
        <GuidedTour
          passos={passos}
          passoAtual={passoAtual}
          onPasso={(passo) => void salvar(passo, "em_andamento")}
          onConcluir={() => void salvar(passos.length - 1, "concluido")}
          onPular={() => void salvar(passoAtual, "dispensado")}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour() {
  const contexto = useContext(TourContext);
  if (!contexto)
    throw new Error("useTour deve ser usado dentro de TourProvider");
  return contexto;
}
