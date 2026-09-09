import {
  INICIO_TOUR_CODIGO,
  INICIO_TOUR_PASSOS,
  INICIO_TOUR_VERSAO,
} from "./inicio-tour";
import { DASHBOARD_COMERCIAL_TOUR } from "./dashboard-comercial-tour";
import { POSICAO_CLIENTE_TOUR } from "./posicao-cliente-tour";
import { POSICAO_CLIENTE_DETALHE_TOUR } from "./posicao-cliente-detalhe-tour";
import type { TourDefinicao } from "./tour-tipos";

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
];

export function tourPorRota(pathname: string) {
  return (
    TOURS.find((tour) =>
      tour.modoRota === "descendente"
        ? pathname.startsWith(`${tour.rota}/`)
        : tour.rota === pathname,
    ) ?? null
  );
}
