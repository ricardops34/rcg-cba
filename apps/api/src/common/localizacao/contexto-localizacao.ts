import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Localização do dispositivo que fez a requisição, lida do cabeçalho
 * `X-Localizacao` (decisão de 20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md). O web manda nos eventos do
 * orçamento; quem grava é `registrarAtividadeOrcamento`, que a lê daqui sem
 * cada serviço precisar repassar.
 *
 * Não é prova de nada: o navegador informa, e a pessoa pode negar ou falsear.
 * Serve de registro de onde a ação disse ter sido feita.
 */
export type LocalizacaoDispositivo =
  | { latitude: number; longitude: number; precisao: number | null }
  | { motivo: MotivoSemLocalizacao };

export const MOTIVOS_SEM_LOCALIZACAO = [
  'negada',
  'indisponivel',
  'tempo',
  'sem_suporte',
  /** A requisição não mandou o cabeçalho (integração, IA, tela antiga). */
  'nao_informada',
] as const;
export type MotivoSemLocalizacao = (typeof MOTIVOS_SEM_LOCALIZACAO)[number];

const armazenamento = new AsyncLocalStorage<
  LocalizacaoDispositivo | undefined
>();

/** Lê o cabeçalho. Valor fora do formato conta como não informado. */
export function lerCabecalhoLocalizacao(
  valor: unknown,
): LocalizacaoDispositivo | undefined {
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  const v = valor.trim();
  const m =
    /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(
      v,
    );
  if (m) {
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0)
    ) {
      return { latitude, longitude, precisao: m[3] ? Number(m[3]) : null };
    }
    return undefined;
  }
  return (MOTIVOS_SEM_LOCALIZACAO as readonly string[]).includes(v)
    ? { motivo: v as MotivoSemLocalizacao }
    : undefined;
}

export function executarComLocalizacao<T>(
  localizacao: LocalizacaoDispositivo | undefined,
  fn: () => T,
): T {
  return armazenamento.run(localizacao, fn);
}

/** A da requisição atual; sem cabeçalho, "não informada". */
export function localizacaoDaRequisicao(): LocalizacaoDispositivo {
  return armazenamento.getStore() ?? { motivo: 'nao_informada' };
}

/** As colunas da Atividade. */
export function colunasLocalizacao(l: LocalizacaoDispositivo) {
  return 'motivo' in l
    ? {
        latitude: null,
        longitude: null,
        localizacaoPrecisao: null,
        localizacaoMotivo: l.motivo,
      }
    : {
        latitude: l.latitude,
        longitude: l.longitude,
        localizacaoPrecisao: l.precisao,
        localizacaoMotivo: null,
      };
}
