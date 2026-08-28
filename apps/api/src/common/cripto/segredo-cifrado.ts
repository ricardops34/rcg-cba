import { InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifragem reversível de segredo de terceiro guardado no banco.
 *
 * Nasceu na chave de API do agente de IA (`agente-cripto.ts`) e foi extraída
 * daqui quando a Evolution GO trouxe o segundo caso: a `GLOBAL_API_KEY` do
 * gateway e o token de cada instância. São segredos do mesmo tipo — precisam
 * ser **usados** para chamar o serviço, então hash não serve (é a diferença
 * para senha de usuário, que é comparada e não reutilizada).
 *
 * AES-256-GCM: além de cifrar, autentica. Um valor adulterado no banco falha
 * na decifragem em vez de virar lixo silencioso.
 *
 * Formato guardado: `iv.tag.conteudo`, tudo em base64. O IV vai junto porque
 * não é segredo — só precisa ser único por mensagem.
 *
 * A chave mestra vem de variável de ambiente e **cada dono escolhe a sua**: o
 * agente usa `AGENTE_IA_CRYPTO_KEY`, o WhatsApp usa `WHATSAPP_CRYPTO_KEY`.
 * Compartilhar uma chave só faria a rotação de uma obrigar a regravar a outra.
 */

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12; // recomendado para GCM

function chaveMestra(variavel: string, ondeRegravar: string): Buffer {
  const bruta = process.env[variavel];
  if (!bruta) {
    // Recusar é melhor que gravar em claro: um segredo de terceiro no banco
    // sem cifra é o tipo de coisa que ninguém descobre até vazar.
    throw new InternalServerErrorException(
      `${variavel} não configurada — não é possível gravar este segredo. ` +
        'Gere 32 bytes em base64 e defina a variável de ambiente.',
    );
  }
  const chave = Buffer.from(bruta, 'base64');
  if (chave.length !== 32) {
    throw new InternalServerErrorException(
      `${variavel} deve ter 32 bytes em base64 (tem ${chave.length}). ${ondeRegravar}`,
    );
  }
  return chave;
}

export interface CofreSegredo {
  cifrar(texto: string): string;
  decifrar(guardado: string): string;
}

/**
 * Monta o par cifrar/decifrar de um dono de segredo.
 *
 * `ondeRegravar` entra nas mensagens de erro porque quem as lê é o
 * administrador: trocar a chave mestra invalida tudo que estava gravado, e a
 * saída é sempre regravar pela tela — dizer qual tela poupa a investigação.
 */
export function criarCofre(
  variavelDaChave: string,
  ondeRegravar: string,
): CofreSegredo {
  return {
    cifrar(texto: string): string {
      const iv = randomBytes(TAMANHO_IV);
      const cipher = createCipheriv(
        ALGORITMO,
        chaveMestra(variavelDaChave, ondeRegravar),
        iv,
      );
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
    },

    decifrar(guardado: string): string {
      const partes = guardado.split('.');
      if (partes.length !== 3) {
        throw new InternalServerErrorException(
          `Segredo gravado em formato inválido. ${ondeRegravar}`,
        );
      }
      const [iv, tag, conteudo] = partes;
      try {
        const decipher = createDecipheriv(
          ALGORITMO,
          chaveMestra(variavelDaChave, ondeRegravar),
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
          `Não foi possível decifrar o segredo gravado. ` +
            `Se a ${variavelDaChave} mudou, ${ondeRegravar.toLowerCase()}`,
        );
      }
    },
  };
}

/** Só o que pode ser exibido: os últimos 4 caracteres. */
export function ultimos4(chave: string): string {
  return chave.slice(-4);
}
