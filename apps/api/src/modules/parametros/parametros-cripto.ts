import { criarCofre } from '../../common/cripto/segredo-cifrado';

/**
 * Cifragem dos parâmetros de tipo `senha` (`SMTP_SENHA`, `SMS_TOKEN`): são
 * credenciais de terceiro que a API precisa **usar**, então hash não serve.
 *
 * Chave mestra própria (`PARAMETROS_CRYPTO_KEY`, decisão do usuário em
 * 2026-10-15), no padrão do agente e do WhatsApp: trocá-la não obriga a
 * regravar os segredos dos outros donos.
 *
 * O valor cifrado leva um prefixo porque a coluna é a mesma de antes: o que
 * está em texto puro (gravado antes da cifragem) continua legível até a
 * varredura da subida (`ParametrosCifragemService`) ou o próximo salvamento.
 */
export const PREFIXO_CIFRADO = 'cifrado:v1:';

export const VARIAVEL_CHAVE_PARAMETROS = 'PARAMETROS_CRYPTO_KEY';

const cofre = criarCofre(
  VARIAVEL_CHAVE_PARAMETROS,
  'Regrave a senha em Administração > E-mail ou o token em Administração > SMS.',
);

export const estaCifrado = (guardado: string) =>
  guardado.startsWith(PREFIXO_CIFRADO);

/** Cifra para gravar. Sem a chave mestra, recusa (melhor que gravar em claro). */
export function cifrarParametro(texto: string): string {
  return PREFIXO_CIFRADO + cofre.cifrar(texto);
}

/**
 * O valor para uso: decifra o que está cifrado e devolve como está o que ainda
 * é texto puro. Lança se a chave mestra faltar ou tiver mudado.
 */
export function abrirParametro(guardado: string): string {
  return estaCifrado(guardado)
    ? cofre.decifrar(guardado.slice(PREFIXO_CIFRADO.length))
    : guardado;
}
