import { InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifragem da chave de API do provedor de IA.
 *
 * Precisa ser **reversível** — a chave é usada para chamar o provedor, então
 * hash não serve (é a diferença para a senha de usuário e para
 * `IntegracaoApiKey`, que são comparadas, não reutilizadas).
 *
 * AES-256-GCM: além de cifrar, autentica. Um valor adulterado no banco falha
 * na decifragem em vez de virar lixo silencioso.
 *
 * Formato guardado: `iv.tag.conteudo`, tudo em base64. Guardar o IV junto é o
 * normal — ele não é segredo, só precisa ser único por mensagem.
 */

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12; // recomendado para GCM

function chaveMestra(): Buffer {
  const bruta = process.env.AGENTE_IA_CRYPTO_KEY;
  if (!bruta) {
    // Recusar é melhor que gravar em claro: um segredo de terceiro no banco
    // sem cifra é o tipo de coisa que ninguém descobre até vazar.
    throw new InternalServerErrorException(
      'AGENTE_IA_CRYPTO_KEY não configurada — não é possível gravar a chave de API do agente. ' +
        'Gere 32 bytes em base64 e defina a variável de ambiente.',
    );
  }
  const chave = Buffer.from(bruta, 'base64');
  if (chave.length !== 32) {
    throw new InternalServerErrorException(
      `AGENTE_IA_CRYPTO_KEY deve ter 32 bytes em base64 (tem ${chave.length}).`,
    );
  }
  return chave;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chaveMestra(), iv);
  const conteudo = Buffer.concat([
    cipher.update(texto, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    conteudo.toString('base64'),
  ].join('.');
}

export function decifrar(guardado: string): string {
  const partes = guardado.split('.');
  if (partes.length !== 3) {
    throw new InternalServerErrorException(
      'Chave de API do agente gravada em formato inválido — regrave pela tela.',
    );
  }
  const [iv, tag, conteudo] = partes;
  try {
    const decipher = createDecipheriv(
      ALGORITMO,
      chaveMestra(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(conteudo, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Chave mestra trocada ou registro adulterado — os dois exigem regravar.
    throw new InternalServerErrorException(
      'Não foi possível decifrar a chave de API do agente. ' +
        'Se a AGENTE_IA_CRYPTO_KEY mudou, regrave a chave pela tela de configuração.',
    );
  }
}

/** Só o que pode ser exibido: os últimos 4 caracteres. */
export function ultimos4(chave: string): string {
  return chave.slice(-4);
}
