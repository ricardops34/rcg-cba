/**
 * Localização do dispositivo nos eventos do orçamento (decisão de 20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md): criação, alteração,
 * decisão do cliente (tela e link) e pedido/liberação/recusa de desconto.
 *
 * Vai no cabeçalho `X-Localizacao` — "lat,lng,precisão em metros" ou o motivo
 * de não ter ("negada", "indisponivel", "tempo", "sem_suporte"). Não é
 * obrigatória: se o navegador negar ou falhar, a ação segue e a API grava o
 * motivo. Quem decide as rotas é `rotaPedeLocalizacao`, chamado pelo
 * `apiFetch` — nenhuma tela precisa lembrar de mandar.
 */

const ROTAS: Array<{ metodo: string; padrao: RegExp }> = [
  { metodo: "POST", padrao: /^\/orcamentos$/ },
  { metodo: "PATCH", padrao: /^\/orcamentos\/[^/]+$/ },
  {
    metodo: "POST",
    padrao: /^\/orcamentos\/[^/]+\/(solicitar-autorizacao-desconto|autorizar-desconto|recusar-desconto)$/,
  },
  { metodo: "POST", padrao: /^\/publico\/orcamentos\/[^/]+\/(aprovar|recusar)$/ },
];

export function rotaPedeLocalizacao(metodo: string, caminho: string) {
  return ROTAS.some((r) => r.metodo === metodo && r.padrao.test(caminho));
}

/** A última leitura vale por 2 minutos: salvar várias vezes seguidas não pergunta de novo. */
const VALIDADE_MS = 2 * 60_000;
let ultima: { valor: string; em: number } | null = null;

/**
 * O valor do cabeçalho. Espera no máximo ~8 s: a ação não pode ficar presa
 * esperando o GPS — sem resposta, vai com "tempo".
 */
export async function cabecalhoLocalizacao(): Promise<string> {
  if (ultima && Date.now() - ultima.em < VALIDADE_MS) return ultima.valor;
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "sem_suporte";

  const valor = await new Promise<string>((resolve) => {
    const desistir = setTimeout(() => resolve("tempo"), 8_500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(desistir);
        const { latitude, longitude, accuracy } = pos.coords;
        resolve(`${latitude.toFixed(6)},${longitude.toFixed(6)},${Math.round(accuracy)}`);
      },
      (erro) => {
        clearTimeout(desistir);
        resolve(
          erro.code === erro.PERMISSION_DENIED
            ? "negada"
            : erro.code === erro.TIMEOUT
              ? "tempo"
              : "indisponivel",
        );
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: VALIDADE_MS },
    );
  });
  // Só a posição obtida fica guardada: depois de negar, a pessoa pode liberar
  // no navegador e a próxima ação já tenta de novo.
  if (/^-?\d/.test(valor)) ultima = { valor, em: Date.now() };
  return valor;
}
