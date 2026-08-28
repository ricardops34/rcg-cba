import { criarCofre, ultimos4 } from '../../common/cripto/segredo-cifrado';

/**
 * Cifragem dos segredos do WhatsApp: a chave administrativa da Evolution GO, o
 * token de cada instância e o segredo que autentica o webhook de volta.
 *
 * Chave mestra própria (`WHATSAPP_CRYPTO_KEY`), separada da do agente de IA de
 * propósito: são segredos de donos diferentes, com ciclos de rotação
 * diferentes, e trocar a chave de um não pode obrigar a regravar a do outro.
 *
 * Quem tem esses valores fala pelo WhatsApp dos vendedores — o mesmo peso da
 * senha do `whatsapp_store`, não o de um token de cache.
 */
const cofre = criarCofre(
  'WHATSAPP_CRYPTO_KEY',
  'Regrave a chave em Administração > WhatsApp > Evolution GO e reconecte as instâncias.',
);

export function cifrarSegredo(texto: string): string {
  return cofre.cifrar(texto);
}

export function decifrarSegredo(guardado: string): string {
  return cofre.decifrar(guardado);
}

/**
 * Decifra sem estourar.
 *
 * Usado onde a ausência do segredo é um estado possível e não um erro: sessão
 * `zapo` (que nunca teve token de instância) e sessão gravada antes de a chave
 * mestra existir. Quem precisa do valor de verdade valida a ausência depois,
 * com uma mensagem que diz o que fazer.
 */
export function decifrarSeHouver(guardado: string | null): string | null {
  if (!guardado) return null;
  try {
    return cofre.decifrar(guardado);
  } catch {
    return null;
  }
}

export { ultimos4 };
