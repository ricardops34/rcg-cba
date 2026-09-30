import { createHmac } from 'node:crypto';
import { segredosIguais } from '../cripto/segredos-iguais';

/**
 * Link assinado para a mídia do WhatsApp em `/uploads/whatsapp`.
 *
 * `/uploads` é servido estático, sem login — o que serve a logo, foto de
 * produto e banner, que são públicos por natureza. A mídia de conversa com
 * cliente não é: o nome aleatório (uuid) não se adivinha, mas um link
 * encaminhado, salvo em log ou em histórico dava acesso sem prazo. Agora a
 * pasta só entrega com `?exp=<unix>&sig=<hmac>` válido e no prazo.
 *
 * O endereço gravado no banco continua o mesmo (`/uploads/whatsapp/<arquivo>`):
 * quem assina é a resposta da API (`AssinarUploadsInterceptor`), na hora de
 * mandar para a tela. `<img>`/`<audio>` não mandam cabeçalho de autorização,
 * por isso a prova vai na própria URL.
 *
 * A chave deriva do JWT_ACCESS_SECRET (sem variável nova); trocar o segredo
 * invalida os links já emitidos, que a tela renova na próxima busca.
 */
export const PREFIXO_ASSINADO = '/uploads/whatsapp/';

/** Validade de um link. Tela aberta mais que isso renova ao buscar de novo. */
const VALIDADE_SEGUNDOS = 24 * 60 * 60;

function chave(): Buffer {
  const segredo = process.env.JWT_ACCESS_SECRET;
  if (!segredo) throw new Error('JWT_ACCESS_SECRET não configurado');
  return createHmac('sha256', segredo).update('uploads-link-assinado:v1').digest();
}

function assinatura(caminho: string, exp: number): string {
  return createHmac('sha256', chave()).update(`${caminho}:${exp}`).digest('base64url');
}

/** Assina um caminho de `/uploads/whatsapp/`; os demais voltam como estão. */
export function assinarUrl(caminho: string, agora = Date.now()): string {
  if (!caminho.startsWith(PREFIXO_ASSINADO) || caminho.includes('?')) return caminho;
  const exp = Math.floor(agora / 1000) + VALIDADE_SEGUNDOS;
  return `${caminho}?exp=${exp}&sig=${assinatura(caminho, exp)}`;
}

/** Confere a assinatura e o prazo de um pedido a `/uploads/whatsapp/`. */
export function linkValido(
  caminho: string,
  exp: string | undefined,
  sig: string | undefined,
  agora = Date.now(),
): boolean {
  const venceEm = Number(exp);
  if (!Number.isInteger(venceEm) || venceEm * 1000 < agora) return false;
  return segredosIguais(assinatura(caminho, venceEm), sig);
}

/**
 * Assina, numa resposta, todo texto que seja caminho de `/uploads/whatsapp/`
 * — em qualquer profundidade. Não mexe em Buffer, Date nem stream.
 */
export function assinarNaResposta<T>(valor: T): T {
  if (typeof valor === 'string') return assinarUrl(valor) as T;
  if (Array.isArray(valor)) return valor.map((v) => assinarNaResposta(v)) as T;
  if (
    valor &&
    typeof valor === 'object' &&
    Object.getPrototypeOf(valor) === Object.prototype
  ) {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = assinarNaResposta(v);
    return saida as T;
  }
  return valor;
}
