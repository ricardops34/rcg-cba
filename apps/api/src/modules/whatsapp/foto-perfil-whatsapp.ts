import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { UPLOADS_DIR } from '../../common/uploads/uploads.config';

/**
 * Onde a API lê os avatares corporativos. Moram no `public` do web, que é
 * quem os serve à tela; a API roda em `apps/api` tanto em dev (bind mount do
 * repositório) quanto na imagem de produção, que copia a pasta para o mesmo
 * caminho relativo (ver `docker/api.Dockerfile`).
 */
export const AVATARES_PADRAO_DIR = join(
  process.cwd(),
  '..',
  'web',
  'public',
  'avatares-padrao',
);

const AVATAR_PADRAO = /^\/avatares-padrao\/(corporativo-\d{2})\.jpg$/;
const AVATAR_ENVIADO =
  /^\/uploads\/avatares\/([a-f0-9]{32}\.(?:jpg|png|webp))$/;

const ehJpeg = (b: Buffer) =>
  b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * Os bytes da foto do perfil, prontos para virar a foto do WhatsApp.
 *
 * Só duas origens valem — o avatar corporativo e a foto que a pessoa enviou —
 * e o caminho gravado é conferido por padrão estrito antes de virar caminho de
 * disco: o `avatarUrl` vem do banco, mas nenhum `../` deve chegar ao
 * `readFile`.
 *
 * O WhatsApp quer JPEG e o gateway não converte. Foto enviada em PNG ou WEBP é
 * recusada com o que fazer, em vez de virar um erro opaco do provedor.
 */
export async function jpegDoAvatar(avatarUrl: string | null): Promise<Buffer> {
  if (!avatarUrl) {
    throw new BadRequestException(
      'Escolha um avatar corporativo ou envie uma foto no perfil antes de usá-la no WhatsApp.',
    );
  }
  const padrao = AVATAR_PADRAO.exec(avatarUrl);
  const enviado = AVATAR_ENVIADO.exec(avatarUrl);
  const caminho = padrao
    ? join(AVATARES_PADRAO_DIR, `${basename(padrao[1])}.jpg`)
    : enviado
      ? join(UPLOADS_DIR, 'avatares', basename(enviado[1]))
      : null;
  if (!caminho) {
    throw new BadRequestException('Foto do perfil em formato não reconhecido.');
  }
  const bytes = await readFile(caminho).catch(() => null);
  if (!bytes) {
    throw new BadRequestException(
      'A foto do perfil não foi encontrada. Escolha ou envie a foto de novo.',
    );
  }
  if (!ehJpeg(bytes)) {
    throw new BadRequestException(
      'O WhatsApp só aceita foto em JPEG. Envie a foto em JPEG ou escolha um avatar corporativo.',
    );
  }
  return bytes;
}
