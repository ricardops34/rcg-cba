import { basename } from 'node:path';
import { armazenamento } from '../../common/armazenamento/armazenamento';

const PREFIXO = '/uploads/whatsapp/';

/**
 * Nome do arquivo na pasta `whatsapp` do armazenamento a partir do `arquivoUrl` gravado, ou
 * `null` se o endereço não é da pasta da mídia. O `basename` impede que um
 * valor adulterado no banco (`../`) apague fora da pasta.
 */
export function arquivoDaMidia(url: string | null | undefined): string | null {
  if (!url) return null;
  const caminho = url.split('?')[0];
  if (!caminho.startsWith(PREFIXO)) return null;
  const nome = basename(caminho);
  return nome && nome !== '.' && nome !== '..' ? nome : null;
}

/**
 * Apaga do armazenamento (disco e S3) a mídia de mensagens já excluídas do banco. Chamar **depois**
 * do commit (ver `apagarConversas`). Arquivo que já não existe conta como
 * apagado; outra falha não desfaz nada — volta na lista para o log, e a
 * varredura de órfãos recolhe depois.
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
      await armazenamento().apagar(`whatsapp/${nome}`);
      apagados += 1;
    } catch {
      falhas.push(nome);
    }
  }
  return { apagados, falhas };
}
