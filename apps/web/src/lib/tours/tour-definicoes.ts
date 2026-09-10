import {
  INICIO_TOUR_CODIGO,
  INICIO_TOUR_PASSOS,
  INICIO_TOUR_VERSAO,
} from "./inicio-tour";
import { DASHBOARD_COMERCIAL_TOUR } from "./dashboard-comercial-tour";
import { POSICAO_CLIENTE_TOUR } from "./posicao-cliente-tour";
import { POSICAO_CLIENTE_DETALHE_TOUR } from "./posicao-cliente-detalhe-tour";
import type { TourDefinicao } from "./tour-tipos";
import { ORCAMENTOS_TOUR } from "./orcamentos-tour";
import { ORCAMENTO_NOVO_TOUR, ORCAMENTO_DETALHE_TOUR } from "./orcamento-form-tour";
import { TOURS_MODULOS } from "./rotinas-modulos";

export type { TourPasso } from "./tour-tipos";

const TOURS: TourDefinicao[] = [
  {
    codigo: INICIO_TOUR_CODIGO,
    versao: INICIO_TOUR_VERSAO,
    rota: "/",
    passos: INICIO_TOUR_PASSOS,
  },
  DASHBOARD_COMERCIAL_TOUR,
  POSICAO_CLIENTE_TOUR,
  POSICAO_CLIENTE_DETALHE_TOUR,
  ORCAMENTOS_TOUR,
  ORCAMENTO_NOVO_TOUR,
  ORCAMENTO_DETALHE_TOUR,
  ...TOURS_MODULOS,
];

export function tourPorRota(pathname: string) {
  return (
    TOURS.find((tour) => tour.modoRota !== "descendente" && tour.rota === pathname) ??
    TOURS.find((tour) =>
      tour.modoRota === "descendente" && pathname.startsWith(`${tour.rota}/`),
    ) ?? null
  );
}
