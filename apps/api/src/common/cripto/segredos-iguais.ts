import { timingSafeEqual } from 'node:crypto';

/**
 * Compara um segredo recebido com o esperado em tempo constante — a comparação
 * comum (`===`) para no primeiro caractere diferente, e o tempo de resposta
 * vaza quanto do segredo já está certo. Tamanhos diferentes dão `false` direto
 * (o tamanho não é o segredo). Vazio ou ausente nunca confere.
 */
export function segredosIguais(esperado: string | null | undefined, recebido: string | null | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
