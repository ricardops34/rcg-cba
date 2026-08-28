import { criarCofre, ultimos4 } from '../../common/cripto/segredo-cifrado';

/**
 * Cifragem da chave de API do provedor de IA.
 *
 * A mecânica (AES-256-GCM, formato `iv.tag.conteudo` em base64) vive em
 * [`common/cripto/segredo-cifrado.ts`](../../common/cripto/segredo-cifrado.ts)
 * desde que a Evolution GO trouxe o segundo segredo do mesmo tipo. O que é
 * deste módulo e continua aqui: **qual chave mestra** protege a chave do
 * agente. Ela é própria de propósito — rotacionar a do WhatsApp não pode
 * obrigar a regravar a do agente.
 *
 * O formato gravado não mudou, então nada precisa ser regravado por causa
 * desta extração.
 */
const cofre = criarCofre(
  'AGENTE_IA_CRYPTO_KEY',
  'Regrave a chave de API em Administração > Agente de IA.',
);

export function cifrar(texto: string): string {
  return cofre.cifrar(texto);
}

export function decifrar(guardado: string): string {
  return cofre.decifrar(guardado);
}

export { ultimos4 };
