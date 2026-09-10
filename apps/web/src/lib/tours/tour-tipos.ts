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
  /** Elemento que confirma o carregamento da tela antes de iniciar o tour. */
  seletorPronto?: string;
  passos: TourPasso[];
}
