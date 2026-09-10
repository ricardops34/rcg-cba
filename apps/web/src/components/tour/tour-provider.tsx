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
  tourPorRota,
  type TourPasso,
} from "@/lib/tours/tour-definicoes";
import { GuidedTour } from "./guided-tour";

interface TourContextValue {
  iniciarTourAtual: () => void;
  tourDisponivel: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [consultados] = useState(() => new Set<string>());
  const tourAtual = tourPorRota(pathname);
  const [execucao, setExecucao] = useState<TourExecucao | null>(null);
  const [passoAtual, setPassoAtual] = useState(0);
  const [passos, setPassos] = useState<TourPasso[]>([]);
  const controleRota = useRef<AbortController | null>(null);
  const [rotaAnterior, setRotaAnterior] = useState(pathname);

  // Descarta o tour antes de renderizar outra página, inclusive outro registro
  // que compartilhe a mesma definição de tour.
  if (rotaAnterior !== pathname) {
    setRotaAnterior(pathname);
    setExecucao(null);
  }

  const iniciar = useCallback(async (origem: TourOrigem) => {
    if (!tourAtual) return;
    const sinal = controleRota.current?.signal;
    if (sinal?.aborted) return;
    if (tourAtual.seletorPronto && !document.querySelector(tourAtual.seletorPronto)) {
      throw new Error("A tela ainda não está pronta para o tour");
    }
    const nova = await apiFetch<TourExecucao>(
      `/tours/${tourAtual.codigo}/execucoes`,
      { method: "POST", body: { versao: tourAtual.versao, origem } },
    );
    if (sinal?.aborted) return;
    const visiveis = tourAtual.passos.filter((passo) => {
      if (!passo.seletor) return true;
      const elemento = document.querySelector<HTMLElement>(passo.seletor);
      if (!elemento) return false;
      const rect = elemento.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    setPassos(visiveis);
    setPassoAtual(0);
    setExecucao(nova);
  }, [tourAtual]);

  useEffect(() => {
    const controle = new AbortController();
    controleRota.current = controle;
    if (!tourAtual) return () => controle.abort();
    const chave = `${tourAtual.codigo}:${tourAtual.versao}`;
    if (consultados.has(chave)) return () => controle.abort();
    let cancelado = false;
    let timer: number | undefined;
    let observador: MutationObserver | undefined;
    const consultar = async () => {
      consultados.add(chave);
      try {
        const estado = await apiFetch<TourEstado>(
          `/tours/${tourAtual.codigo}/estado`,
          { query: { versao: tourAtual.versao } },
        );
        if (!cancelado && estado.deveIniciarAutomaticamente) {
          await iniciar("automatico");
        }
      } catch {
        consultados.delete(chave);
        // A indisponibilidade do recurso de apresentação nunca deve impedir
        // o uso normal da plataforma.
      }
    };
    const agendar = () => {
      if (tourAtual.seletorPronto && !document.querySelector(tourAtual.seletorPronto)) return;
      observador?.disconnect();
      timer = window.setTimeout(() => void consultar(), 650);
    };
    if (tourAtual.seletorPronto) {
      observador = new MutationObserver(agendar);
      observador.observe(document.body, { childList: true, subtree: true });
    }
    agendar();
    return () => {
      cancelado = true;
      controle.abort();
      observador?.disconnect();
      window.clearTimeout(timer);
    };
  }, [iniciar, tourAtual, consultados, pathname]);

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

  const iniciarTourAtual = useCallback(() => {
    if (!tourAtual) return;
    void iniciar("manual").catch(() => {
      toast.error("Não foi possível iniciar o tour. Tente novamente.");
    });
  }, [iniciar, tourAtual]);

  return (
    <TourContext.Provider
      value={{ iniciarTourAtual, tourDisponivel: tourAtual !== null }}
    >
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
