import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { LOGOS_DIR } from '../uploads/uploads.config';

export type LogoPdf = { dados: string; formato: 'PNG' | 'JPEG' };

/**
 * Lê um logo de empresa do disco e devolve um data URL pronto para o jsPDF, ou
 * `null`.
 *
 * `logoUrl` é o caminho público (`/uploads/logos/<arquivo>`); só o nome do
 * arquivo é usado para montar o caminho em disco, porque o valor vem do banco
 * e não deve poder apontar para fora de `LOGOS_DIR`.
 *
 * Falha silenciosa em qualquer ponto: sem logo o PDF sai sem a imagem, o que é
 * melhor do que não sair.
 */
export async function carregarLogo(
  logoUrl: string | null | undefined,
): Promise<LogoPdf | null> {
  if (!logoUrl) return null;
  try {
    const arquivo = basename(logoUrl);
    if (!arquivo || arquivo.startsWith('.')) return null;

    const extensao = arquivo.slice(arquivo.lastIndexOf('.')).toLowerCase();
    // WEBP e SVG são aceitos no upload do logo da empresa, mas o jsPDF não os
    // embute e no servidor não há canvas para rasterizar. Nesse caso o PDF
    // sai sem imagem.
    const formato =
      extensao === '.png'
        ? 'PNG'
        : extensao === '.jpg' || extensao === '.jpeg'
          ? 'JPEG'
          : null;
    if (!formato) return null;

    const conteudo = await readFile(join(LOGOS_DIR, arquivo));
    const mime = formato === 'PNG' ? 'image/png' : 'image/jpeg';
    return {
      dados: `data:${mime};base64,${conteudo.toString('base64')}`,
      formato,
    };
  } catch {
    return null;
  }
}
