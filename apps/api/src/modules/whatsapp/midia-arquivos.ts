import {
  armazenamento,
  chaveDoEndereco,
} from '../../common/armazenamento/armazenamento';

const PASTA = 'whatsapp/';

/**
 * Caminho do arquivo dentro da pasta `whatsapp` do armazenamento a partir do
 * `arquivoUrl` gravado — `<empresaId>/<uuid>.jpg` desde 2026-10-13, só
 * `<uuid>.jpg` antes —, ou `null` se o endereço não é da mídia.
 * `chaveDoEndereco` recusa `..` e afins: um valor adulterado no banco não
 * apaga fora da pasta.
 */
export function arquivoDaMidia(url: string | null | undefined): string | null {
  const chave = chaveDoEndereco(url);
  return chave?.startsWith(PASTA) ? chave.slice(PASTA.length) : null;
}

/**
 * Apaga do armazenamento (disco e S3) a mídia de mensagens já excluídas do
 * banco. Chamar **depois** do commit (ver `apagarConversas`). Arquivo que já
 * não existe conta como apagado; outra falha não desfaz nada — volta na lista
 * para o log, e a varredura de órfãos recolhe depois.
 */
export async function apagarArquivosDaMidia(urls: (string | null)[]) {
  const nomes = [
    ...new Set(urls.map(arquivoDaMidia).filter((n): n is string => !!n)),
  ];
  let apagados = 0;
  const falhas: string[] = [];
  for (const nome of nomes) {
    try {
      // Já não existir não é erro: `apagar` ignora.
      await armazenamento().apagar(`${PASTA}${nome}`);
      apagados += 1;
    } catch {
      falhas.push(nome);
    }
  }
  return { apagados, falhas };
}
