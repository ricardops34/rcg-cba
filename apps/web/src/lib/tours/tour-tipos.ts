export interface TourPasso {
  seletor?: string;
  titulo: string;
  descricao: string;
}

export interface TourDefinicao {
  codigo: string;
  versao: number;
  rota: string;
  modoRota?: "exata" | "descendente";
  passos: TourPasso[];
}
