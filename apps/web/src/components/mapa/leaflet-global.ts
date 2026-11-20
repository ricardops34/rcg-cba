import L from "leaflet";

/**
 * O leaflet.markercluster procura o Leaflet no `L` global. Importe este
 * módulo **antes** de "leaflet.markercluster": módulos ES rodam na ordem dos
 * imports, então o global já existe quando o plugin carrega. Só em arquivos
 * carregados no navegador (dynamic com ssr: false).
 */
if (typeof window !== "undefined") {
  (window as unknown as { L: typeof L }).L = L;
}

export default L;
