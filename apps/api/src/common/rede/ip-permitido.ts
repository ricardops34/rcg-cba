/**
 * Confere um IP contra uma lista de IPs e faixas (CIDR) — SEC-12.
 *
 * Só o que a integração precisa: IPv4 com ou sem máscara (`200.150.10.20`,
 * `200.150.10.0/24`) e IPv6 por igualdade exata. Sem dependência: a lista vem
 * de um cadastro curto, e um parser de rede inteiro seria mais código do que o
 * problema.
 */

/** `::ffff:200.150.10.20` (IPv4 dentro de IPv6, como o Node entrega) vira `200.150.10.20`. */
export function normalizarIp(ip: string): string {
  let v = ip.trim().toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const mapeado = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return mapeado ? mapeado[1] : v;
}

function ipv4ParaNumero(ip: string): number | null {
  const partes = ip.split('.');
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n;
}

/** Aceita `a.b.c.d`, `a.b.c.d/0-32` ou um IPv6 (sem máscara). */
export function ipOuFaixaValido(valor: string): boolean {
  const v = normalizarIp(valor);
  const [base, mascara, resto] = v.split('/');
  if (resto !== undefined) return false;
  if (ipv4ParaNumero(base) !== null) {
    if (mascara === undefined) return true;
    return /^\d{1,2}$/.test(mascara) && Number(mascara) <= 32;
  }
  // IPv6: sem máscara, só caracteres de endereço.
  return mascara === undefined && base.includes(':') && /^[0-9a-f:]+$/.test(base);
}

export function ipPermitido(ip: string | undefined | null, lista: string[]): boolean {
  if (!ip) return false;
  const alvo = normalizarIp(ip);
  const alvoNumero = ipv4ParaNumero(alvo);
  for (const item of lista) {
    const v = normalizarIp(item);
    const [base, mascara] = v.split('/');
    if (mascara === undefined) {
      if (v === alvo) return true;
      continue;
    }
    const baseNumero = ipv4ParaNumero(base);
    if (baseNumero === null || alvoNumero === null) continue;
    const bits = Number(mascara);
    // `>>> 0` mantém o resultado sem sinal; máscara 0 é "qualquer IPv4".
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((alvoNumero & mask) >>> 0) === ((baseNumero & mask) >>> 0)) return true;
  }
  return false;
}
