import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { WHATSAPP_DIR } from '../../common/uploads/uploads.config';

const PREFIXO = '/uploads/whatsapp/';

/**
 * Nome do arquivo em `WHATSAPP_DIR` a partir do `arquivoUrl` gravado, ou
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
 * Apaga do disco a mídia de mensagens já excluídas do banco. Chamar **depois**
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
      await unlink(join(WHATSAPP_DIR, nome));
      apagados += 1;
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') apagados += 1;
      else falhas.push(nome);
    }
  }
  return { apagados, falhas };
}
